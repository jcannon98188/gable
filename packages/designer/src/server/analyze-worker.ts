// Runs the Template language service over a project and prints the diagnostics as JSON, each located (when it is inside a
// template literal) by the literal's text and an offset into it, which is what the Preview agent can place on the canvas.
// `analyze-main.ts` runs it in a separate process: a type-check takes seconds and must not block the backend's server.
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { analyzeProject } from "@gable/language-service";
import { literalAt, sourceText } from "./source.js";

export interface ProjectDiagnostic {
  id: string;
  /** Path relative to the project root, with forward slashes. */
  file: string;
  line: number;
  column: number;
  severity: "warn" | "error";
  rule: string;
  message: string;
  /** Set when the diagnostic lies inside a template literal. */
  raw?: string;
  offset?: number;
}

export interface AnalysisOutput {
  diagnostics: ProjectDiagnostic[];
  configErrors: string[];
}

export function analyze(root: string): AnalysisOutput {
  const result = analyzeProject(root);
  const cache = new Map<string, ReturnType<typeof sourceText>>();
  const diagnostics = result.diagnostics.map((d, i): ProjectDiagnostic => {
    let src = cache.get(d.file);
    if (!src) cache.set(d.file, (src = sourceText(readFileSync(d.file, "utf8"))));
    const at = literalAt(src, d.start);
    return {
      id: `d${i}`,
      file: relative(root, d.file).replaceAll("\\", "/"),
      line: d.line,
      column: d.column,
      severity: d.severity,
      rule: d.rule,
      message: d.message,
      ...(at ? { raw: at.raw, offset: at.offset } : {}),
    };
  });
  return { diagnostics, configErrors: result.configErrors };
}
