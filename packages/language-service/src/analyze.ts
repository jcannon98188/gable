import path from "node:path";
import ts from "@typescript/typescript6";
import { parseExpression, parseHandler } from "@gable/core/tooling";
import { readConfig, type AnalyzerConfig, type RuleId, type Severity } from "./config.js";
import { emit, type Emitted, type Group, type Ref, type TemplateModel } from "./emit.js";
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
}

export interface AnalysisResult {
  diagnostics: Diagnostic[];
  /** Problems with the invocation or tsconfig; when present nothing was analyzed. */
  configErrors: string[];
}

type RawDiagnostic = Omit<Diagnostic, "severity" | "line" | "column">;

/** Resolves `project` (a tsconfig file or a directory holding one) and analyzes every template in it. */
export function analyzeProject(project: string): AnalysisResult {
  const configPath = ts.sys.directoryExists(project) ? path.join(project, "tsconfig.json") : project;
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) return { diagnostics: [], configErrors: [ts.flattenDiagnosticMessageText(read.error.messageText, "\n")] };
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath), undefined, configPath);
  const { config, errors } = readConfig(parsed.options);
  const configErrors = [...parsed.errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n")), ...errors];
  if (configErrors.length) return { diagnostics: [], configErrors };
  return { diagnostics: analyze(parsed.fileNames, parsed.options, config), configErrors: [] };
}

const norm = (f: string) => f.replace(/\\/g, "/");

interface FileState {
  sf: ts.SourceFile;
  models: TemplateModel[];
  /** Ordinals (per file) of path steps that are Observables/Promises. */
  observed: Set<number>;
  /** Expression offset -> parser verdict (problem is null when valid). */
  syntax: Map<number, { problem: string | null; length: number }>;
}

function analyze(rootNames: string[], options: ts.CompilerOptions, config: AnalyzerConfig): Diagnostic[] {
  const programWith = (overlay: Map<string, string>, old?: ts.Program): ts.Program => {
    const host = ts.createCompilerHost(options, true);
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
  for (const sf of base.getSourceFiles()) {
    if (sf.isDeclarationFile || !rootNames.some((r) => norm(r) === norm(sf.fileName))) continue;
    const models = findTemplates(sf, config.templateTag, (start, length, message) =>
      raw.push({ file: sf.fileName, start, length, rule: "template-syntax", message }),
    );
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
      const result = emit(state.models, state.observed, validator(state), state.sf.text.length);
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
    for (const ref of first.emitted.get(file)!.refs) {
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

  // Apply per-rule severity, then position and de-duplicate.
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const d of raw.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start)) {
    const severity: Severity = config.severity[d.rule];
    const key = `${d.file}:${d.start}:${d.rule}`;
    if (severity === "off" || seen.has(key)) continue;
    seen.add(key);
    const sf = files.get(norm(d.file))!.sf;
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start);
    out.push({ ...d, severity, line: line + 1, column: character + 1 });
  }
  return out;
}

// --- finding templates ------------------------------------------------------

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  return node;
}

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
          const model = scanLiteral(sf, node.name.text, value.template, onError);
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
function scanLiteral(sf: ts.SourceFile, className: string, literal: ts.TemplateLiteral, onError: OnError): TemplateModel | undefined {
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
    return { className, tree: scanTemplate(text, bodyStart), holes };
  } catch (err) {
    if (!(err instanceof ScanError)) throw err;
    onError(err.start, err.length, err.message);
    return undefined;
  }
}

// --- rules that need types ----------------------------------------------------

function findIdentifier(sf: ts.SourceFile, pos: number): ts.Identifier | undefined {
  let found: ts.Identifier | undefined;
  const visit = (node: ts.Node): void => {
    if (found || pos < node.pos || pos >= node.end) return;
    if (ts.isIdentifier(node) && node.getStart(sf) === pos) found = node;
    else ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** A signal is anything typed as (or extending) a `*Signal` interface: ReadonlySignal, WritableSignal, InputSignal... */
function isSignal(checker: ts.TypeChecker, type: ts.Type): boolean {
  const seen = new Set<ts.Type>();
  const check = (t: ts.Type): boolean => {
    if (seen.has(t)) return false;
    seen.add(t);
    if (t.isUnion()) return t.types.some(check);
    const name = t.aliasSymbol?.name ?? t.getSymbol()?.name;
    if (name && /Signal$/.test(name)) return true;
    const target = (t.flags & ts.TypeFlags.Object && (t as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference ? (t as ts.TypeReference).target : t) as ts.Type;
    return target.isClassOrInterface() ? checker.getBaseTypes(target).some(check) : false;
  };
  return check(checker.getNonNullableType(type));
}

function isObservableLike(checker: ts.TypeChecker, type: ts.Type): boolean {
  const t = checker.getNonNullableType(type);
  const callable = (name: string) => {
    const p = t.getProperty(name);
    return !!p && checker.getTypeOfSymbol(p).getCallSignatures().length > 0;
  };
  return callable("subscribe") || callable("then");
}

function classifyRef(ref: Ref, sf: ts.SourceFile, checker: ts.TypeChecker, observed: Set<number>, report: (rule: RuleId, message: string) => void): void {
  const kind = ref.group.kind;
  if (kind === "hole" || kind === "handler") return;
  const id = findIdentifier(sf, ref.part.gen);
  if (!id) return;
  const step = ts.isPropertyAccessExpression(id.parent) && id.parent.name === id ? id.parent : id;
  const type = checker.getTypeAtLocation(step);
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return;
  const shown = step.getText(sf).replace(/^__c\./, "");
  const called = ts.isCallExpression(step.parent) && step.parent.expression === step;
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
  const part = group.parts.find((p) => p.src !== undefined && at >= p.gen && at < p.gen + p.text.length);
  const start = part ? part.src! + (at - part.gen) : group.srcStart;
  const length = part ? Math.min(d.length ?? 1, part.text.length - (at - part.gen)) : Math.max(1, group.srcEnd - group.srcStart);
  const rule: RuleId = UNKNOWN_MEMBER.has(d.code) ? "unknown-member" : group.kind === "model" ? "model-not-writable" : "type-mismatch";
  return { file, start, length, rule, message: ts.flattenDiagnosticMessageText(d.messageText, "\n") };
}
