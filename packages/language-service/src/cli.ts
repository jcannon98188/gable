import path from "node:path";
import { analyzeProject, type Diagnostic } from "./analyze.js";
import { fixProject } from "./apply.js";

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

const USAGE = `Usage: gable-check [--project <tsconfig.json | dir>] [--format text|json] [--fix]

Type-checks html templates against their component classes. --fix first applies
the quick fixes (extracting computed view-model signals, calling bare signals).
Exits 1 when any
diagnostic has severity "error", 2 on a usage or configuration problem.
Rule severities (off | warn | error) come from the "@gable/language-service"
entry of compilerOptions.plugins in the tsconfig.
`;

/** Runs gable-check and returns the exit code. */
export function main(argv: string[], io: CliIo, cwd = process.cwd()): number {
  let project = ".";
  let format: "text" | "json" = "text";
  let fix = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--project" || arg === "-p") project = argv[++i] ?? "";
    else if (arg === "--format") {
      const value = argv[++i];
      if (value !== "text" && value !== "json") return usageError(io, `--format must be "text" or "json"`);
      format = value;
    } else if (arg === "--fix") fix = true;
    else if (arg === "--help" || arg === "-h") {
      io.stdout(USAGE);
      return 0;
    } else return usageError(io, `unknown argument "${arg}"`);
  }
  if (!project) return usageError(io, "--project needs a value");

  const target = path.resolve(cwd, project);
  if (fix) for (const file of fixProject(target)) io.stderr(`gable-check: fixed ${path.relative(cwd, file).split(path.sep).join("/")}\n`);
  const { diagnostics, configErrors } = analyzeProject(target);
  if (configErrors.length) {
    for (const e of configErrors) io.stderr(`gable-check: configuration error: ${e}\n`);
    return 2;
  }
  io.stdout(format === "json" ? JSON.stringify(diagnostics.map((d) => ({ ...d, file: d.file.replace(/\\/g, "/") })), null, 2) + "\n" : text(diagnostics, cwd));
  return diagnostics.some((d) => d.severity === "error") ? 1 : 0;
}

function usageError(io: CliIo, message: string): number {
  io.stderr(`gable-check: ${message}\n${USAGE}`);
  return 2;
}

function text(diagnostics: Diagnostic[], cwd: string): string {
  const lines = diagnostics.map((d) => `${path.relative(cwd, d.file).replace(/\\/g, "/")}:${d.line}:${d.column} ${d.severity} gable/${d.rule} ${d.message}`);
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  if (diagnostics.length) lines.push("", `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`);
  return lines.map((l) => l + "\n").join("");
}
