#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { runCli } from "./cli.js";

process.exitCode = runCli(process.argv.slice(2), {
  readFile: (p) => readFileSync(p, "utf8"),
  writeFile: (p, c) => writeFileSync(p, c),
  readStdin: () => readFileSync(0, "utf8"),
  stdout: (s) => void process.stdout.write(s),
  stderr: (s) => void process.stderr.write(s),
});
