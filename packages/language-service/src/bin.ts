#!/usr/bin/env node
import { main } from "./cli.js";

process.exitCode = main(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
});
