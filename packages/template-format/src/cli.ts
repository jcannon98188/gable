import { formatTemplateLiterals, type LiteralFormatOptions } from "./index.js";

export interface CliIo {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  readStdin(): string;
  stdout(s: string): void;
  stderr(s: string): void;
}

const USAGE = `Usage: gable-format [--check] [--stdin] [--tab-width n] [--use-tabs] [--print-width n] [--tag name] [files...]

Rewrites only html template literals in the given files (or stdin to stdout with --stdin).
--check lists files that would change and exits 1 without writing.`;

/** Returns the process exit code: 0 ok, 1 --check found differences, 2 usage or I/O error. */
export function runCli(argv: string[], io: CliIo): number {
  const options: LiteralFormatOptions = {};
  const files: string[] = [];
  let stdin = false;
  let check = false;
  for (let n = 0; n < argv.length; n++) {
    const a = argv[n]!;
    const num = () => Number(argv[++n]);
    if (a === "--stdin") stdin = true;
    else if (a === "--check") check = true;
    else if (a === "--use-tabs") options.useTabs = true;
    else if (a === "--tab-width") options.indentSize = num();
    else if (a === "--print-width") options.printWidth = num();
    else if (a === "--tag") options.tag = argv[++n];
    else if (a === "--help" || a === "-h") {
      io.stdout(USAGE + "\n");
      return 0;
    } else if (a.startsWith("--")) {
      io.stderr(`Unknown option ${a}\n${USAGE}\n`);
      return 2;
    } else files.push(a);
  }
  if (stdin) {
    io.stdout(formatTemplateLiterals(io.readStdin(), options));
    return 0;
  }
  if (!files.length) {
    io.stderr(USAGE + "\n");
    return 2;
  }
  let code = 0;
  for (const file of files) {
    try {
      const before = io.readFile(file);
      const after = formatTemplateLiterals(before, options);
      if (after === before) continue;
      if (check) {
        io.stdout(file + "\n");
        code = 1;
      } else io.writeFile(file, after);
    } catch (e) {
      io.stderr(`${file}: ${(e as Error).message}\n`);
      code = 2;
    }
  }
  return code;
}
