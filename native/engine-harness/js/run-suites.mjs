#!/usr/bin/env node
// Runs Gable's own test suites inside an embedded engine.
//
//   node native/engine-harness/js/run-suites.mjs [--engine gable|quickjs|node]...
//        [--filter <substring>]... [--jobs N] [--json <file>] [--list]
//
// Every packages/*/src/**/*.test.ts file is classified:
//   - `// @vitest-environment jsdom|happy-dom`: out of scope, needs a DOM,
//     which the engine never provides (spec section 8);
//   - its module graph imports a Node built-in: out of scope, Node tooling
//     (the Vite plugin, the CLI, the Designer server...), not app code;
//   - otherwise in scope: it must pass under the engine.
// In-scope files are bundled (js/bundle.mjs) and run on each engine asked
// for. `node` runs the same bundles in Node: it checks the vitest shim, since
// a file that passes under vitest must pass there too.
//
// Exit status: 1 when any in-scope test fails on any engine that is not
// listed in suites-expected.json, or a listed failure (other than a
// `timing:` one) now passes.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { bundleTest, outName, repoRoot, here, ensureDir } from "./bundle.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name) out.push(args[++i]);
  return out;
};
const flag = (name) => args.includes(name);
const engines = opt("--engine").length ? opt("--engine") : ["gable"];
const filters = opt("--filter");
const jobs = Number(opt("--jobs")[0] || Math.max(1, Math.min(8, os.cpus().length - 1)));
const jsonOut = opt("--json")[0];
const harnessDir = path.resolve(here, "..");
const outDir = path.join(harnessDir, "out", "suites");
const exe = path.join(harnessDir, "target", "release", process.platform === "win32" ? "gable-harness.exe" : "gable-harness");
const expectedPath = path.join(here, "suites-expected.json");

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(repoRoot, p).split(path.sep).join("/");

function discover() {
  const files = [];
  for (const pkg of fs.readdirSync(path.join(repoRoot, "packages"))) {
    const src = path.join(repoRoot, "packages", pkg, "src");
    if (fs.existsSync(src)) walk(src, files);
  }
  return files.sort().filter((f) => !filters.length || filters.some((s) => rel(f).includes(s)));
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

function run(cmd, argv) {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function parse(stdout) {
  const tests = [];
  let done = null, module = null;
  const errors = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^@@gable-(test|done|error|module) (.*)$/.exec(line);
    if (!m) continue;
    const v = JSON.parse(m[2]);
    if (m[1] === "test") tests.push(v);
    else if (m[1] === "done") done = v;
    else if (m[1] === "error") errors.push(v.error);
    else module = v;
  }
  return { tests, done, module, errors };
}

async function runFile(engine, bundle) {
  const t0 = Date.now();
  const r = engine === "node" ? await run(process.execPath, ["--unhandled-rejections=warn", bundle]) : await run(exe, ["run", "--engine", engine, bundle]);
  const p = parse(r.stdout);
  const problems = [...p.errors];
  if (p.module) {
    if (p.module.error) problems.push(`module: ${p.module.error}`);
    for (const u of p.module.uncaught) problems.push(`uncaught: ${u}`);
    for (const u of p.module.unhandled) problems.push(`unhandled rejection: ${u}`);
  }
  if (!p.done) problems.push(`the run did not finish (exit ${r.code})${r.stderr ? `: ${r.stderr.slice(-2000)}` : ""}`);
  return { tests: p.tests, problems, ms: Date.now() - t0, stderr: r.stderr };
}

async function main() {
  const files = discover();
  ensureDir(outDir);
  const inScope = [];
  const outOfScope = [];
  await pool(files, jobs, async (f) => {
    const src = fs.readFileSync(f, "utf8");
    const env = /@vitest-environment\s+(jsdom|happy-dom)/.exec(src);
    if (env) {
      outOfScope.push({ file: rel(f), reason: `needs a DOM (${env[1]}); the engine provides none (spec section 8)` });
      return;
    }
    const direct = [...src.matchAll(/^import[^"']*["'](node:[^"']+)["']/gm)].map((m) => m[1]);
    // A test that loads a repo script by URL at run time (pack-names) tests
    // that Node script, not app code.
    const script = /new URL\(["']((?:\.\.\/)+scripts\/[^"']+\.mjs)["']/.exec(src);
    if (script) {
      outOfScope.push({ file: rel(f), reason: `Node tooling: loads ${script[1].replace(/^(\.\.\/)+/, "")} at run time` });
      return;
    }
    if (direct.length) {
      outOfScope.push({ file: rel(f), reason: `Node tooling: imports ${[...new Set(direct)].slice(0, 4).join(", ")}${direct.length > 4 ? ", ..." : ""}` });
      return;
    }
    const bundle = path.join(outDir, outName(f));
    let nodeImports;
    try {
      nodeImports = await bundleTest(f, bundle);
    } catch (e) {
      inScope.push({ file: rel(f), bundle, bundleError: String(e && e.message ? e.message : e).slice(0, 2000) });
      return;
    }
    if (nodeImports.length) {
      outOfScope.push({ file: rel(f), reason: `Node tooling: imports ${nodeImports.slice(0, 4).join(", ")}${nodeImports.length > 4 ? ", ..." : ""}` });
      return;
    }
    inScope.push({ file: rel(f), bundle });
  });
  inScope.sort((a, b) => a.file.localeCompare(b.file));
  outOfScope.sort((a, b) => a.file.localeCompare(b.file));
  if (flag("--list")) {
    for (const s of inScope) console.log(`in   ${s.file}${s.bundleError ? "  (bundle error)" : ""}`);
    for (const s of outOfScope) console.log(`out  ${s.file}  ${s.reason}`);
    console.log(`${inScope.length} in scope, ${outOfScope.length} out of scope`);
    return;
  }
  if (engines.some((e) => e !== "node") && !fs.existsSync(exe)) {
    console.error(`missing ${exe}: run cargo build --release in native/engine-harness first`);
    process.exit(2);
  }
  const expected = fs.existsSync(expectedPath) ? JSON.parse(fs.readFileSync(expectedPath, "utf8")) : {};
  const summary = { engines: {}, inScope: inScope.map((s) => s.file), outOfScope };
  let bad = false;
  for (const engine of engines) {
    const t0 = Date.now();
    const results = await pool(inScope, jobs, async (s) => {
      if (s.bundleError) return { file: s.file, tests: [], problems: [`bundle: ${s.bundleError}`], ms: 0 };
      return { file: s.file, ...(await runFile(engine, s.bundle)) };
    });
    const counts = { files: results.length, pass: 0, fail: 0, skip: 0, fileProblems: 0 };
    const failures = {};
    for (const r of results) {
      for (const t of r.tests) {
        counts[t.status]++;
        if (t.status === "fail") failures[`${r.file} > ${t.name}`] = t.error;
      }
      if (r.problems.length) {
        counts.fileProblems++;
        failures[`${r.file} (file)`] = r.problems.join("\n");
      }
    }
    const exp = expected[engine] || {};
    const unexpected = Object.keys(failures).filter((k) => !(k in exp));
    // A `timing:` entry is a wall-clock budget calibrated for V8: performance
    // is reported, not gated (js-engine-spec section 11), so it may pass or
    // fail. Any other entry must still fail, or the list is stale.
    const fixed = Object.keys(exp).filter((k) => !(k in failures) && !String(exp[k]).startsWith("timing:"));
    console.log(`\n== ${engine}: ${counts.files} files, ${counts.pass} passed, ${counts.fail} failed, ${counts.skip} skipped, ${counts.fileProblems} file-level problems (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    for (const k of unexpected) console.log(`FAIL ${k}\n     ${String(failures[k]).split("\n").join("\n     ")}`);
    for (const k of Object.keys(failures).filter((k) => k in exp)) console.log(`known ${k}: ${exp[k]}`);
    for (const k of fixed) console.log(`FIXED (remove from suites-expected.json) ${k}`);
    if (unexpected.length || fixed.length) bad = true;
    summary.engines[engine] = { counts, failures, files: results.map((r) => ({ file: r.file, ms: r.ms, tests: r.tests.length, pass: r.tests.filter((t) => t.status === "pass").length })) };
  }
  console.log(`\n${inScope.length} files in scope, ${outOfScope.length} out of scope (DOM or Node tooling)`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
