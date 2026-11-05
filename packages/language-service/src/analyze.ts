import path from "node:path";
import ts from "@typescript/typescript6";
import { parseExpression, parseHandler } from "@gable/core/tooling";
import { readConfig, type AnalyzerConfig, type RuleId, type Severity } from "./config.js";
import { emit, type Emitted, type EventSite, type Group, type Ref, type TemplateModel } from "./emit.js";
import { findIdentifier, inCallee, isObservableLike, isSignal, unwrap } from "./typeutil.js";
import { callSignalFix, extractFix, type Fix, type FixEnv } from "./fixes.js";
import { templateRules } from "./file-rules.js";
import { scanTemplate, ScanError, type ExprKind, type Src } from "./scan.js";

export interface Diagnostic {
  file: string;
  /** 1-based. */
  line: number;
  column: number;
  /** Offset and length in the source file. */
  start: number;
  length: number;
  rule: RuleId;
  severity: "warn" | "error";
  message: string;
  /** Quick fixes, best first. Edits are absolute offsets into files. */
  fixes?: Fix[];
}

export interface AnalysisResult {
  diagnostics: Diagnostic[];
  /** Problems with the invocation or tsconfig; when present nothing was analyzed. */
  configErrors: string[];
}

type RawDiagnostic = Omit<Diagnostic, "severity" | "line" | "column">;

/** Rules whose diagnostics get quick fixes. */
const FIXABLE = new Set<RuleId>(["bare-signal", "call-non-signal", "expression-syntax"]);

/** Resolves `project` (a tsconfig file or a directory holding one) and analyzes every template in it. */
export function analyzeProject(project: string): AnalysisResult {
  const configPath = ts.sys.directoryExists(project) ? path.join(project, "tsconfig.json") : project;
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) return { diagnostics: [], configErrors: [ts.flattenDiagnosticMessageText(read.error.messageText, "\n")] };
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath), undefined, configPath);
  const { config, errors } = readConfig(parsed.options);
  const configErrors = [...parsed.errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n")), ...errors];
  if (configErrors.length) return { diagnostics: [], configErrors };
  return { diagnostics: analyzeSources(parsed.fileNames, parsed.options, config).diagnostics, configErrors: [] };
}

/** Everything the editor layer needs to answer position queries about one analysis run. */
export interface Analysis {
  diagnostics: Diagnostic[];
  options: ts.CompilerOptions;
  rootNames: string[];
  defaultLib?: string;
  /** Source text per file, after overrides, with the type-check blocks appended for files holding templates. */
  overlay: Map<string, string>;
  /** Files that hold templates, with their generated type-check blocks. */
  files: Map<string, { sf: ts.SourceFile; emitted: Emitted }>;
}

export const norm = (f: string) => f.replace(/\\/g, "/");

interface FileState {
  sf: ts.SourceFile;
  models: TemplateModel[];
  /** Ordinals (per file) of path steps that are Observables/Promises. */
  observed: Set<number>;
  /** Expression offset -> parser verdict (problem is null when valid). */
  syntax: Map<number, { problem: string | null; length: number }>;
}

/** Analyzes the given files; `overrides` (normalized path -> text) replaces on-disk text, e.g. unsaved editor buffers. */
export function analyzeSources(rootNames: string[], options: ts.CompilerOptions, config: AnalyzerConfig, overrides: ReadonlyMap<string, string> = new Map(), defaultLib?: string): Analysis {
  const programWith = (generated: Map<string, string>, old?: ts.Program): ts.Program => {
    const overlay = new Map([...overrides, ...generated]);
    const host = ts.createCompilerHost(options, true);
    // A host that bundles its own compiler (the editor plugin) points at the lib files it should check against.
    if (defaultLib) {
      host.getDefaultLibFileName = () => defaultLib;
      host.getDefaultLibLocation = () => path.dirname(defaultLib);
    }
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersionOrOptions, ...rest) => {
      const text = overlay.get(norm(fileName));
      return text === undefined ? getSourceFile(fileName, languageVersionOrOptions, ...rest) : ts.createSourceFile(fileName, text, languageVersionOrOptions, true);
    };
    return ts.createProgram({ rootNames, options, host, oldProgram: old });
  };

  const raw: RawDiagnostic[] = [];
  const base = programWith(new Map());
  const files = new Map<string, FileState>();
  const components = new Map<string, ComponentInfo>();
  const sources = new Map<string, ts.SourceFile>();
  for (const sf of base.getSourceFiles()) {
    if (sf.isDeclarationFile || !rootNames.some((r) => norm(r) === norm(sf.fileName))) continue;
    sources.set(norm(sf.fileName), sf);
    for (const c of findComponents(sf)) components.set(c.selector, c);
    const models = findTemplates(sf, config.templateTag, (start, length, message) =>
      raw.push({ file: sf.fileName, start, length, rule: "template-syntax", message }),
    );
    for (const model of models) templateRules(model, base.getTypeChecker(), (start, length, rule, message) => raw.push({ file: sf.fileName, start, length, rule, message }));
    if (models.length) files.set(norm(sf.fileName), { sf, models, observed: new Set(), syntax: new Map() });
  }

  // Expression grammar is owned by @gable/core; a rejected expression gets one diagnostic and no check code.
  const validator = (state: FileState) => (e: Src, kind: ExprKind): boolean => {
    let verdict = state.syntax.get(e.start);
    if (!verdict) {
      let problem: string | null = null;
      try {
        if (kind === "handler") parseHandler(e.text);
        else parseExpression(e.text);
      } catch (err) {
        const message = (err as Error).message;
        const prefix = `Invalid template expression "${e.text}": `;
        problem = message.startsWith(prefix) ? message.slice(prefix.length) : message;
      }
      verdict = { problem, length: Math.max(1, e.text.length) };
      state.syntax.set(e.start, verdict);
    }
    return verdict.problem === null;
  };

  const generate = () => {
    const overlay = new Map<string, string>();
    const emitted = new Map<string, Emitted>();
    for (const [file, state] of files) {
      const result = emit(state.models, state.observed, validator(state), state.sf.text.length, (tag) => componentType(components.get(tag), state.sf.fileName));
      emitted.set(file, result);
      overlay.set(file, state.sf.text + result.text);
    }
    return { overlay, emitted };
  };

  // Pass 1: find which path steps are Observables/Promises, and apply the type-based rules.
  const first = generate();
  let program = programWith(first.overlay, base);
  const checker = program.getTypeChecker();
  for (const [file, state] of files) {
    const sf = program.getSourceFile(state.sf.fileName)!;
    const emitted = first.emitted.get(file)!;
    checkEvents(emitted, sf, checker, (site, message) =>
      raw.push({ file: state.sf.fileName, start: site.nameStart, length: Math.max(1, site.name.length), rule: "unknown-event", message }),
    );
    for (const ref of emitted.refs) {
      classifyRef(ref, sf, checker, state.observed, (rule, message) =>
        raw.push({ file: state.sf.fileName, start: ref.srcStart, length: ref.srcEnd - ref.srcStart, rule, message }),
      );
    }
  }

  // Pass 2 (only when something is observed): regenerate with unwrapping, then take the checker's diagnostics.
  let final = first;
  if ([...files.values()].some((s) => s.observed.size)) {
    final = generate();
    program = programWith(final.overlay, program);
  }
  for (const [file, state] of files) {
    const sf = program.getSourceFile(state.sf.fileName)!;
    const emitted = final.emitted.get(file)!;
    for (const d of program.getSemanticDiagnostics(sf)) {
      if (d.start === undefined || d.start < state.sf.text.length || d.code === 2349) continue;
      const mapped = mapDiagnostic(d, emitted.groups, state.sf.fileName);
      if (mapped) raw.push(mapped);
    }
    for (const [start, { problem, length }] of state.syntax) {
      if (problem !== null) raw.push({ file: state.sf.fileName, start, length, rule: "expression-syntax", message: problem });
    }
  }

  // Quick fixes, now that types are known.
  const taken = new Map<string, Set<string>>();
  const classType = (sf: ts.SourceFile, name: string): ts.Type | undefined => {
    const decl = sf.statements.find((n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === name);
    return decl && program.getTypeChecker().getTypeAtLocation(decl);
  };
  for (const d of raw) {
    if (!FIXABLE.has(d.rule)) continue;
    const state = files.get(norm(d.file));
    if (!state) continue;
    const emitted = final.emitted.get(norm(d.file))!;
    const checked = program.getSourceFile(state.sf.fileName)!;
    if (d.rule === "bare-signal") {
      d.fixes = [callSignalFix(d.file, d.start + d.length, state.sf.text.slice(d.start, d.start + d.length))];
      continue;
    }
    const site = emitted.sites.find((x) => d.start >= x.expr.start && d.start <= x.expr.start + x.expr.text.length);
    if (!site) continue;
    const env: FixEnv = { sf: state.sf, checked, checker: program.getTypeChecker(), classType: (n) => classType(checked, n), taken };
    const fix = extractFix(d.file, site, env);
    if (fix) d.fixes = [fix];
  }

  // Apply per-rule severity, then position and de-duplicate.
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const d of raw.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start)) {
    const severity: Severity = config.severity[d.rule];
    const key = `${d.file}:${d.start}:${d.rule}`;
    if (severity === "off" || seen.has(key)) continue;
    seen.add(key);
    const sf = sources.get(norm(d.file))!;
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start);
    out.push({ ...d, severity, line: line + 1, column: character + 1 });
  }
  const overlay = new Map([...overrides, ...final.overlay]);
  const analyzed = new Map<string, { sf: ts.SourceFile; emitted: Emitted }>();
  for (const [file, state] of files) analyzed.set(file, { sf: state.sf, emitted: final.emitted.get(file)! });
  return { diagnostics: out, options, rootNames, overlay, files: analyzed, defaultLib };
}

// --- finding templates ------------------------------------------------------

type OnError = (start: number, length: number, message: string) => void;

/** Finds `static meta = { template: html`...` }` in each class and scans the template. */
function findTemplates(sf: ts.SourceFile, tag: string, onError: OnError): TemplateModel[] {
  const models: TemplateModel[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name) {
      for (const member of node.members) {
        if (!ts.isPropertyDeclaration(member) || !member.initializer) continue;
        if (!member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) || !ts.isIdentifier(member.name) || member.name.text !== "meta") continue;
        const meta = unwrap(member.initializer);
        if (!ts.isObjectLiteralExpression(meta)) continue;
        for (const prop of meta.properties) {
          if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name) || prop.name.text !== "template") continue;
          const value = unwrap(prop.initializer);
          if (!ts.isTaggedTemplateExpression(value) || !ts.isIdentifier(value.tag) || value.tag.text !== tag) continue;
          const lineStart = sf.getLineStarts()[sf.getLineAndCharacterOfPosition(member.getStart(sf)).line]!;
          const indent = /^[ \t]*/.exec(sf.text.slice(lineStart))![0];
          const model = scanLiteral(sf, node, { insertAt: node.members[node.members.length - 1]!.end, indent }, value.template, onError);
          if (model) models.push(model);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return models;
}

/** `${}` holes are blanked out of the scanned text (never parsed inside) and returned as plain TS expressions. */
function scanLiteral(sf: ts.SourceFile, classNode: ts.ClassDeclaration, placement: { insertAt: number; indent: string }, literal: ts.TemplateLiteral, onError: OnError): TemplateModel | undefined {
  const bodyStart = literal.getStart(sf) + 1;
  const holes: Src[] = [];
  let text = sf.text.slice(bodyStart, literal.end - 1);
  if (ts.isTemplateExpression(literal)) {
    let before: ts.TemplateHead | ts.TemplateMiddle = literal.head;
    for (const span of literal.templateSpans) {
      const holeStart = before.end - 2;
      const exprEnd = span.literal.getStart(sf);
      const raw = sf.text.slice(before.end, exprEnd);
      holes.push({ text: raw.trim(), start: before.end + raw.length - raw.trimStart().length });
      text = text.slice(0, holeStart - bodyStart) + " ".repeat(exprEnd + 1 - holeStart) + text.slice(exprEnd + 1 - bodyStart);
      before = span.literal as ts.TemplateMiddle;
    }
  }
  try {
    return { className: classNode.name!.text, classNode, tree: scanTemplate(text, bodyStart), holes, ...placement };
  } catch (err) {
    if (!(err instanceof ScanError)) throw err;
    onError(err.start, err.length, err.message);
    return undefined;
  }
}

// --- rules that need types ----------------------------------------------------

function classifyRef(ref: Ref, sf: ts.SourceFile, checker: ts.TypeChecker, observed: Set<number>, report: (rule: RuleId, message: string) => void): void {
  const kind = ref.group.kind;
  if (kind === "hole") return;
  const id = findIdentifier(sf, ref.part.gen);
  if (!id) return;
  const inHandler = kind === "handler";
  if (inHandler && inCallee(id)) return;
  const step = ts.isPropertyAccessExpression(id.parent) && id.parent.name === id ? id.parent : id;
  const type = checker.getTypeAtLocation(step);
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return;
  const shown = step.getText(sf).replace(/^__c\./, "");
  const called = ts.isCallExpression(step.parent) && step.parent.expression === step;
  // Handler arguments are plain value positions: only Observable/Promise unwrapping applies there.
  if (inHandler) {
    if (!called && isObservableLike(checker, type)) observed.add(ref.ordinal);
    return;
  }
  if (called) {
    if (isSignal(checker, type)) return;
    if (isObservableLike(checker, type)) {
      report("call-observable", `"${shown}" is an Observable or Promise, not a signal: reference it without calling it (${shown}); it reads as T | undefined`);
    } else {
      report("call-non-signal", `"${shown}" is not a signal: value expressions only call signals. Move the logic into a computed signal on the component and read it`);
    }
    return;
  }
  if (kind === "model" && ref.srcEnd === ref.group.srcEnd) return;
  if (isSignal(checker, type)) report("bare-signal", `"${shown}" is a signal; call it: ${shown}()`);
  else if (isObservableLike(checker, type)) observed.add(ref.ordinal);
}

const UNKNOWN_MEMBER = new Set([2304, 2339, 2551, 2552]);

/** Maps a checker diagnostic in generated code back to template text; scaffolding errors are dropped. */
function mapDiagnostic(d: ts.Diagnostic, groups: Group[], file: string): RawDiagnostic | undefined {
  const at = d.start!;
  const group = groups.find((g) => at >= g.genStart && at < g.genEnd);
  if (!group) return undefined;
  // An error on scaffolding (`__c.`, `__rd(`) is reported at the next piece of template text.
  const part = group.parts.find((p) => p.src !== undefined && at >= p.gen && at < p.gen + p.text.length) ?? group.parts.find((p) => p.src !== undefined && p.gen >= at);
  const into = part && at >= part.gen ? at - part.gen : 0;
  const start = part ? part.src! + into : group.srcStart;
  const length = part ? Math.max(1, Math.min(d.length ?? 1, part.text.length - into)) : Math.max(1, group.srcEnd - group.srcStart);
  const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  const rule: RuleId = UNKNOWN_MEMBER.has(d.code)
    ? "unknown-member"
    : group.kind === "model"
      ? message.includes("Property 'set' is missing")
        ? "model-not-writable"
        : "model-type-mismatch"
      : "type-mismatch";
  return { file, start, length, rule, message };
}

// --- components and events -----------------------------------------------------

interface ComponentInfo {
  selector: string;
  className: string;
  fileName: string;
  exported: boolean;
}

/** Classes whose `static meta` has a literal `selector`. */
function findComponents(sf: ts.SourceFile): ComponentInfo[] {
  const out: ComponentInfo[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name) {
      for (const member of node.members) {
        if (!ts.isPropertyDeclaration(member) || !member.initializer || !ts.isIdentifier(member.name) || member.name.text !== "meta") continue;
        if (!member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) continue;
        const meta = unwrap(member.initializer);
        if (!ts.isObjectLiteralExpression(meta)) continue;
        for (const prop of meta.properties) {
          if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name) || prop.name.text !== "selector" || !ts.isStringLiteralLike(prop.initializer)) continue;
          const exported = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
          out.push({ selector: prop.initializer.text, className: node.name.text, fileName: sf.fileName, exported });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** How generated code in `fromFile` can name the component class, or undefined when it cannot. */
function componentType(info: ComponentInfo | undefined, fromFile: string): string | undefined {
  if (!info) return undefined;
  if (norm(info.fileName) === norm(fromFile)) return info.className;
  if (!info.exported) return undefined;
  let rel = norm(path.relative(path.dirname(fromFile), info.fileName)).replace(/[.][cm]?tsx?$/, "");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return `import(${JSON.stringify(rel)}).${info.className}`;
}

function probeType(sf: ts.SourceFile, checker: ts.TypeChecker, probe: { gen: number }): ts.Type | undefined {
  const id = findIdentifier(sf, probe.gen + "declare const ".length);
  return id ? checker.getTypeAtLocation(id) : undefined;
}

/** Event names must be DOM events of the element or outputs of the component; near misses get a suggestion. */
function checkEvents(emitted: Emitted, sf: ts.SourceFile, checker: ts.TypeChecker, report: (site: EventSite, message: string) => void): void {
  const tagMap = probeType(sf, checker, emitted.tags);
  const nativeTags = new Set(tagMap?.getProperties().map((p) => p.name));
  for (const site of emitted.events) {
    const dom = probeType(sf, checker, site.dom);
    if (!dom) continue;
    const names = new Set(dom.getProperties().map((p) => p.name));
    if (site.component) {
      const type = probeType(sf, checker, site.component);
      if (!type) continue;
      for (const p of type.getProperties()) {
        const member = checker.getTypeOfSymbol(p);
        if (isObservableLike(checker, member) && !isSignal(checker, member)) names.add(p.name);
      }
    } else if (!nativeTags.has(site.tag)) continue;
    if (names.has(site.name)) continue;
    const hint = closest(site.name, [...names]);
    report(site, `Unknown event "${site.name}" on <${site.tag}>${hint ? `. Did you mean "${hint}"?` : ""}`);
  }
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}

/** The candidate nearest to `name`, when it is near enough to be a plausible typo. */
function closest(name: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Math.max(2, Math.floor(name.length / 3)) + 1;
  for (const c of candidates) {
    const d = distance(name.toLowerCase(), c.toLowerCase());
    if (d < bestDistance) [best, bestDistance] = [c, d];
  }
  return best;
}
