#!/usr/bin/env node
// Gable-level benchmarks: the bench/*.bench.ts workloads plus @gable/ui
// bundle startup, on the AgniJS engine, the interim engine (QuickJS-NG) and
// Node (for reference). Each (engine, benchmark) pair runs in its own
// process so peak RSS belongs to that workload alone.
//
//   node native/engine-harness/js/run-bench.mjs [--iterations N] [--warmup N]
//        [--engine agnijs|quickjs|node]... [--filter <name>]... [--out <file.json>]
//
// Performance is reported, never gated (js-engine-spec section 11,
// condition 3): this script fails only when a benchmark errors or the
// engines disagree on a checksum.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { bundleBench, ensureDir, here, repoRoot } from "./bundle.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name) out.push(args[++i]);
  return out;
};
const iterations = Number(opt("--iterations")[0] || 10);
const warmup = Number(opt("--warmup")[0] || 2);
const engines = opt("--engine").length ? opt("--engine") : ["agnijs", "quickjs", "node"];
const filters = opt("--filter");
const harnessDir = path.resolve(here, "..");
const benchDir = path.join(harnessDir, "bench");
const outDir = path.join(harnessDir, "out", "bench");
const outFile = opt("--out")[0];
const exe = path.join(harnessDir, "target", "release", process.platform === "win32" ? "gable-harness.exe" : "gable-harness");

function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      const line = stdout.trim().split(/\r?\n/).filter((l) => l.startsWith("{")).pop();
      if (code !== 0 || !line) reject(new Error(`${path.basename(cmd)} ${argv.join(" ")} exited ${code}\n${stderr.slice(-3000)}${stdout.slice(-2000)}`));
      else resolve(JSON.parse(line));
    });
  });
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const geomean = (xs) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);

async function main() {
  ensureDir(outDir);
  const jobs = [];
  for (const f of fs.readdirSync(benchDir).filter((f) => f.endsWith(".bench.ts")).sort()) {
    const bundle = path.join(outDir, f.replace(/\.ts$/, ".mjs"));
    await bundleBench(path.join(benchDir, f), bundle);
    const names = execFileSync(exe, ["list", bundle], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
    for (const name of names) jobs.push({ name, bundle, kind: "bench" });
  }
  const uiBundle = path.join(outDir, "ui-startup.mjs");
  await bundleBench(path.join(repoRoot, "packages", "ui", "src", "index.ts"), uiBundle);
  jobs.push({ name: "ui-bundle-startup", bundle: uiBundle, kind: "startup", bytes: fs.statSync(uiBundle).size });

  const results = [];
  for (const job of jobs.filter((j) => !filters.length || filters.some((f) => j.name.includes(f)))) {
    const row = { name: job.name, engines: {} };
    if (job.bytes) row.bundle_bytes = job.bytes;
    for (const engine of engines) {
      let r;
      if (engine === "node") {
        if (job.kind === "startup") continue;
        r = await run(process.execPath, [path.join(here, "bench-node.mjs"), job.bundle, job.name, String(warmup), String(iterations)]);
      } else if (job.kind === "startup") {
        r = await run(exe, ["startup", "--engine", engine, "--warmup", String(warmup), "--iterations", String(iterations), job.bundle]);
      } else {
        r = await run(exe, ["bench", "--engine", engine, "--name", job.name, "--warmup", String(warmup), "--iterations", String(iterations), job.bundle]);
      }
      const ms = r.samples_ns.map((n) => n / 1e6);
      row.engines[engine] = { median_ms: +median(ms).toFixed(3), min_ms: +Math.min(...ms).toFixed(3), heap_mib: +(r.heap_bytes / 1048576).toFixed(2), peak_rss_mib: r.peak_rss_bytes ? +(r.peak_rss_bytes / 1048576).toFixed(1) : null, checksum: r.checksum };
      process.stderr.write(`${job.name} ${engine}: ${row.engines[engine].median_ms} ms\n`);
    }
    const sums = new Set(Object.values(row.engines).map((e) => e.checksum));
    if (sums.size > 1) throw new Error(`${job.name}: engines disagree on the checksum: ${JSON.stringify(row.engines)}`);
    const g = row.engines.agnijs, q = row.engines.quickjs, n = row.engines.node;
    if (g && q) row.agnijs_vs_quickjs = +(g.median_ms / q.median_ms).toFixed(2);
    if (g && n) row.agnijs_vs_node = +(g.median_ms / n.median_ms).toFixed(2);
    results.push(row);
  }
  const ratios = results.map((r) => r.agnijs_vs_quickjs).filter(Boolean);
  let commit = "";
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {}
  const report = {
    date: new Date().toISOString(),
    commit,
    machine: { os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, memory_gib: +(os.totalmem() / 2 ** 30).toFixed(1), node: process.version },
    warmup,
    iterations,
    geomean_agnijs_vs_quickjs: ratios.length ? +geomean(ratios).toFixed(2) : null,
    results,
  };
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n");
  console.log(`| benchmark | agnijs ms | quickjs ms | node ms | agnijs/quickjs | agnijs peak RSS MiB | quickjs peak RSS MiB |`);
  console.log(`|---|---:|---:|---:|---:|---:|---:|`);
  for (const r of results) {
    const e = (k, f) => (r.engines[k] ? r.engines[k][f] : "-");
    console.log(`| ${r.name} | ${e("agnijs", "median_ms")} | ${e("quickjs", "median_ms")} | ${e("node", "median_ms")} | ${r.agnijs_vs_quickjs ?? "-"} | ${e("agnijs", "peak_rss_mib")} | ${e("quickjs", "peak_rss_mib")} |`);
  }
  console.log(`\ngeomean agnijs/quickjs: ${report.geomean_agnijs_vs_quickjs}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
