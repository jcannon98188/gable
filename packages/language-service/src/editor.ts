// Editor queries over one analysis run: quick info, go-to-definition, completions.
// The analyzer type-checks generated code appended to each source file; a query at a
// template offset is mapped to the matching generated offset, answered by a real
// TypeScript language service over the same text, and mapped back.

import path from "node:path";
import ts from "@typescript/typescript6";
import { norm, type Analysis, type Diagnostic } from "./analyze.js";
import { RULES, type RuleId } from "./config.js";

export interface Span {
  start: number;
  length: number;
}

/** Numeric diagnostic code per rule, by position in the catalogue (append new rules; never reorder). */
export const RULE_CODES = Object.fromEntries(Object.keys(RULES).map((rule, i) => [rule, 90000 + i])) as Record<RuleId, number>;

const BLOCK_KEYWORDS = ["if", "else", "else if", "for", "empty", "switch", "case", "default", "let", "defer", "placeholder", "loading", "error"];

export class EditorSession {
  private service: ts.LanguageService | undefined;

  constructor(readonly analysis: Analysis) {}

  /** Template diagnostics for one file. */
  diagnostics(file: string): Diagnostic[] {
    return this.analysis.diagnostics.filter((d) => norm(d.file) === norm(file));
  }

  /** The generated-code offset for a template offset, when it lies inside an expression. */
  toGenerated(file: string, offset: number): number | undefined {
    const emitted = this.analysis.files.get(norm(file))?.emitted;
    if (!emitted) return undefined;
    let inclusive: number | undefined;
    for (const group of emitted.groups) {
      if (offset < group.srcStart || offset > group.srcEnd) continue;
      for (const part of group.parts) {
        if (part.src === undefined) continue;
        if (offset >= part.src && offset < part.src + part.text.length) return part.gen + (offset - part.src);
        if (offset === part.src + part.text.length) inclusive = part.gen + part.text.length;
      }
    }
    return inclusive;
  }

  /** Maps a span in generated code back to template text. */
  fromGenerated(file: string, span: Span): Span | undefined {
    const emitted = this.analysis.files.get(norm(file))?.emitted;
    if (!emitted) return undefined;
    for (const group of emitted.groups) {
      if (span.start < group.genStart || span.start >= group.genEnd) continue;
      for (const part of group.parts) {
        if (part.src === undefined || span.start < part.gen || span.start >= part.gen + part.text.length) continue;
        const start = part.src + (span.start - part.gen);
        return { start, length: Math.min(span.length, part.text.length - (span.start - part.gen)) };
      }
    }
    return undefined;
  }

  quickInfo(file: string, offset: number): ts.QuickInfo | undefined {
    const at = this.toGenerated(file, offset);
    if (at === undefined) return undefined;
    const info = this.languageService().getQuickInfoAtPosition(this.rootFor(file), at);
    const textSpan = info && this.fromGenerated(file, info.textSpan);
    return info && textSpan ? { ...info, textSpan } : undefined;
  }

  definition(file: string, offset: number): ts.DefinitionInfoAndBoundSpan | undefined {
    const at = this.toGenerated(file, offset);
    if (at === undefined) return undefined;
    const found = this.languageService().getDefinitionAndBoundSpan(this.rootFor(file), at);
    const textSpan = found && this.fromGenerated(file, found.textSpan);
    if (!found || !textSpan) return undefined;
    const originalLength = this.originalLength(file);
    const definitions: ts.DefinitionInfo[] = [];
    for (const def of found.definitions ?? []) {
      if (def.name.startsWith("__")) continue; // the signal's internal call signature, not something to jump to
      if (norm(def.fileName) !== norm(file) || def.textSpan.start < originalLength) {
        definitions.push(def);
        continue;
      }
      // A definition inside generated code is a template local (@let, @for item, #ref).
      const local = this.fromGenerated(file, def.textSpan);
      if (local) definitions.push({ ...def, textSpan: local, contextSpan: undefined });
    }
    return { definitions, textSpan };
  }

  completions(file: string, offset: number): ts.WithMetadata<ts.CompletionInfo> | undefined {
    const at = this.toGenerated(file, offset);
    if (at === undefined) return undefined;
    const info = this.languageService().getCompletionsAtPosition(this.rootFor(file), at, {
      includeCompletionsForModuleExports: false,
      includeCompletionsWithInsertText: false,
    });
    if (!info) return undefined;
    return {
      ...info,
      isMemberCompletion: true,
      optionalReplacementSpan: undefined,
      entries: info.entries.map((e) => ({ ...e, replacementSpan: undefined, source: undefined, sourceDisplay: undefined })),
    };
  }

  completionDetails(file: string, offset: number, name: string): ts.CompletionEntryDetails | undefined {
    const at = this.toGenerated(file, offset);
    return at === undefined ? undefined : this.languageService().getCompletionEntryDetails(this.rootFor(file), at, name, undefined, undefined, undefined, undefined);
  }

  private originalLength(file: string): number {
    return this.analysis.files.get(norm(file))!.sf.text.length;
  }

  private rootFor(file: string): string {
    return this.analysis.rootNames.find((r) => norm(r) === norm(file)) ?? file;
  }

  private languageService(): ts.LanguageService {
    if (this.service) return this.service;
    const { overlay, options, rootNames, defaultLib } = this.analysis;
    const read = (f: string) => overlay.get(norm(f)) ?? ts.sys.readFile(f);
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => rootNames,
      getScriptVersion: () => "1",
      getScriptSnapshot: (f) => {
        const text = read(f);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => (options.configFilePath ? path.dirname(String(options.configFilePath)) : ts.sys.getCurrentDirectory()),
      getCompilationSettings: () => options,
      getDefaultLibFileName: (o) => defaultLib ?? ts.getDefaultLibFilePath(o),
      fileExists: (f) => overlay.has(norm(f)) || ts.sys.fileExists(f),
      readFile: read,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };
    return (this.service = ts.createLanguageService(host, ts.createDocumentRegistry()));
  }
}

/**
 * Completion needs something to complete: after a `.`, or in an empty expression, there is
 * no identifier yet (and `user.` is not a valid expression), so the probe inserts a
 * placeholder identifier at the cursor. The returned offset is just after it.
 */
export function completionProbe(text: string, offset: number): { text: string; offset: number } {
  if (/[\w$]/.test(text[offset - 1] ?? "")) return { text, offset };
  return { text: text.slice(0, offset) + "_" + text.slice(offset), offset: offset + 1 };
}

/** `@` followed by a partial block keyword inside a template literal tagged `tag`: the keyword completions. */
export function blockKeywordCompletions(text: string, offset: number, tag: string): ts.WithMetadata<ts.CompletionInfo> | undefined {
  if (!/@[a-z]*$/.test(text.slice(Math.max(0, offset - 12), offset))) return undefined;
  const sf = ts.createSourceFile("template.ts", text, ts.ScriptTarget.Latest, true);
  let inside = false;
  const visit = (node: ts.Node): void => {
    if (inside || offset < node.pos || offset > node.end) return;
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === tag && offset > node.template.getStart(sf) && offset < node.template.end) inside = true;
    else ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!inside) return undefined;
  return {
    isGlobalCompletion: false,
    isMemberCompletion: false,
    isNewIdentifierLocation: false,
    entries: BLOCK_KEYWORDS.map((name, i) => ({ name, kind: ts.ScriptElementKind.keyword, kindModifiers: "", sortText: String(i).padStart(2, "0") })),
  };
}
