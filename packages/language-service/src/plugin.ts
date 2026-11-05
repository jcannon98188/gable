// The tsserver plugin: a thin wrapper that answers editor requests from the analyzer.
// tsserver loads it by the name in tsconfig `compilerOptions.plugins` (or as a global
// plugin from the VS Code extension); rule severities come from the same entry.

import ts from "@typescript/typescript6";
import { analyzeSources, norm } from "./analyze.js";
import { readConfig } from "./config.js";
import { blockKeywordCompletions, completionProbe, EditorSession, RULE_CODES } from "./editor.js";
import { fixesFor } from "./fixes.js";

/** The slice of tsserver's plugin host this plugin uses. */
export interface PluginInfo {
  languageService: ts.LanguageService;
  languageServiceHost: ts.LanguageServiceHost;
  project: {
    getProjectVersion(): string;
    getCompilerOptions(): ts.CompilerOptions;
    projectService: { logger: { info(message: string): void } };
  };
}

/** Marks a language service the plugin already wraps (the extension's global plugin and a tsconfig entry can both load it). */
const WRAPPED = Symbol.for("gable.language-service.wrapped");

export function createPlugin(info: PluginInfo): ts.LanguageService {
  const base = info.languageService;
  if ((base as unknown as Record<symbol, unknown>)[WRAPPED]) return base;
  const log = (message: string) => info.project.projectService.logger.info(`[gable] ${message}`);

  const settings = () => readConfig(info.project.getCompilerOptions());
  const hasTemplates = (file: string, text: string) => text.includes(`${settings().config.templateTag}\``) && /\.[cm]?tsx?$/.test(file);
  const textOf = (file: string): string | undefined => {
    const snapshot = info.languageServiceHost.getScriptSnapshot(file);
    return snapshot?.getText(0, snapshot.getLength());
  };

  const analyze = (overrides: Map<string, string>): EditorSession => {
    const { config, errors } = settings();
    for (const e of errors) log(`configuration error: ${e}`);
    const roots = info.languageServiceHost.getScriptFileNames();
    for (const r of roots) if (!overrides.has(norm(r))) overrides.set(norm(r), textOf(r) ?? "");
    return new EditorSession(analyzeSources(roots, info.project.getCompilerOptions(), config, overrides, info.languageServiceHost.getDefaultLibFileName(info.project.getCompilerOptions())));
  };

  let cached: { version: string; session: EditorSession } | undefined;
  const current = (): EditorSession => {
    const version = info.project.getProjectVersion();
    if (cached?.version !== version) cached = { version, session: analyze(new Map()) };
    return cached.session;
  };

  /** Runs `query`, never letting an analyzer failure break the editor's own answers. */
  const guarded = <T>(what: string, query: () => T | undefined): T | undefined => {
    try {
      return query();
    } catch (err) {
      log(`${what} failed: ${(err as Error).stack ?? err}`);
      return undefined;
    }
  };
  const gated = <T>(file: string, what: string, query: () => T | undefined): T | undefined => {
    const text = textOf(file);
    return text !== undefined && hasTemplates(file, text) ? guarded(what, query) : undefined;
  };

  const proxy = Object.create(null) as ts.LanguageService;
  for (const key of Object.keys(base) as Array<keyof ts.LanguageService>) {
    const member = base[key];
    (proxy as unknown as Record<string, unknown>)[key] = typeof member === "function" ? (member as (...a: unknown[]) => unknown).bind(base) : member;
  }

  proxy.getSemanticDiagnostics = (file) => {
    const prior = base.getSemanticDiagnostics(file);
    // File rules (constructors, module-level state) apply to files without templates too.
    const found = /\.[cm]?tsx?$/.test(file) ? guarded("diagnostics", () => {
      const sf = base.getProgram()?.getSourceFile(file);
      if (!sf) return undefined;
      return current()
        .diagnostics(file)
        .map<ts.Diagnostic>((d) => ({
          file: sf,
          start: d.start,
          length: d.length,
          messageText: d.message,
          category: d.severity === "error" ? ts.DiagnosticCategory.Error : ts.DiagnosticCategory.Warning,
          code: RULE_CODES[d.rule],
          source: "gable",
        }));
    }) : undefined;
    return found ? [...prior, ...found] : prior;
  };

  let probe: { file: string; offset: number; session: EditorSession } | undefined;
  proxy.getCompletionsAtPosition = (file, position, options, settingsArg) => {
    const own = gated(file, "completions", () => {
      const text = textOf(file)!;
      const keywords = blockKeywordCompletions(text, position, settings().config.templateTag);
      if (keywords) return keywords;
      const p = completionProbe(text, position);
      const session = p.text === text ? current() : analyze(new Map([[norm(file), p.text]]));
      const result = session.completions(file, p.offset);
      if (result) probe = { file, offset: p.offset, session };
      return result;
    });
    return own ?? base.getCompletionsAtPosition(file, position, options, settingsArg);
  };

  proxy.getCompletionEntryDetails = (file, position, name, ...rest) => {
    const own = probe && norm(probe.file) === norm(file) ? guarded("completion details", () => probe!.session.completionDetails(file, probe!.offset, name)) : undefined;
    return own ?? base.getCompletionEntryDetails(file, position, name, ...rest);
  };

  proxy.getQuickInfoAtPosition = (file, position, ...rest) =>
    gated(file, "quick info", () => current().quickInfo(file, position)) ?? base.getQuickInfoAtPosition(file, position, ...rest);

  proxy.getDefinitionAndBoundSpan = (file, position) =>
    gated(file, "definition", () => current().definition(file, position)) ?? base.getDefinitionAndBoundSpan(file, position);

  proxy.getDefinitionAtPosition = (file, position) =>
    gated(file, "definition", () => current().definition(file, position)?.definitions) ?? base.getDefinitionAtPosition(file, position);

  proxy.getCodeFixesAtPosition = (file, start, end, codes, ...rest) => {
    const prior = base.getCodeFixesAtPosition(file, start, end, codes, ...rest);
    const own = gated(file, "code fixes", () => {
      const session = current();
      const wanted = new Set(codes);
      const diagnostics = session.diagnostics(file).filter((d) => wanted.has(RULE_CODES[d.rule]));
      return fixesFor(diagnostics, file, start, end).map<ts.CodeFixAction>((fix) => ({
        fixName: "gable",
        description: fix.description,
        changes: [{ fileName: file, textChanges: fix.edits.map((e) => ({ span: { start: e.start, length: e.length }, newText: e.newText })) }],
      }));
    });
    return own ? [...prior, ...own] : prior;
  };

  (proxy as unknown as Record<symbol, unknown>)[WRAPPED] = true;
  return proxy;
}

/** tsserver's plugin entry point. */
export default function init(): { create(info: PluginInfo): ts.LanguageService } {
  return { create: createPlugin };
}
