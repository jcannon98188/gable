#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { main } from "./index.js";

process.exitCode = await main(process.argv.slice(2), process.env, {
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
  install: (pm, cwd) => spawnSync(`${pm} install`, { cwd, stdio: "inherit", shell: true }).status ?? 1,
});
