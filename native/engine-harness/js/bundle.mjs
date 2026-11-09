// Bundles test files and benchmark entries into single ESM files the
// harness can load into an engine: TypeScript is stripped by rolldown, the
// workspace aliases come from the root vitest.config.ts (so the bundles see
// the same module graph vitest does), and `vitest` resolves to the shim.

// rolldown is not a direct dependency: vitest 5 brings it in through vite,
// and npm hoists it to the root node_modules.
import { rolldown } from "rolldown";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { builtinModules } from "node:module";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");
export const shimPath = path.join(here, "vitest-shim.js");
export const preludePath = path.join(here, "host-prelude.js");

let aliasesPromise;
async function aliases() {
  aliasesPromise ??= import(pathToFileURL(path.join(repoRoot, "vitest.config.ts")).href).then((m) => m.default.resolve.alias);
  return aliasesPromise;
}

const ENTRY = "\0gable-harness-entry";

const builtins = new Set(builtinModules);

function harnessPlugin(entrySource, alias, nodeImports) {
  return {
    name: "gable-harness",
    resolveId(id) {
      if (id === ENTRY) return id;
      if (id.startsWith("node:") || builtins.has(id) || builtins.has(id.split("/")[0])) {
        nodeImports.add(id);
        return { id, external: true };
      }
      if (id === "vitest") return shimPath;
      for (const a of alias) {
        if (typeof a.find === "string" ? a.find === id : a.find.test(id)) return a.replacement;
      }
      return null;
    },
    load(id) {
      if (id === ENTRY) return entrySource;
      return null;
    },
  };
}

/**
 * Bundle `entrySource` into `outFile`. Returns the Node built-in modules the
 * graph imports (left external): a non-empty set means the code is Node
 * tooling and cannot run in an engine.
 */
async function bundleEntry(entrySource, outFile) {
  const alias = await aliases();
  const nodeImports = new Set();
  const build = await rolldown({
    input: ENTRY,
    cwd: repoRoot,
    platform: "neutral",
    plugins: [harnessPlugin(entrySource, alias, nodeImports)],
    resolve: { conditionNames: ["import", "module", "default"], mainFields: ["module", "main"] },
    // App bundles get process.env.NODE_ENV replaced by the bundler (Vite
    // does it); vitest runs with NODE_ENV=test.
    transform: { target: "es2022", define: { "process.env.NODE_ENV": JSON.stringify("test") } },
    logLevel: "silent",
    treeshake: true,
  });
  try {
    await build.write({ file: outFile, format: "esm", codeSplitting: false, sourcemap: false });
  } finally {
    await build.close();
  }
  return [...nodeImports];
}

const rel = (p) => path.relative(repoRoot, p).split(path.sep).join("/");

/** Bundle one test file into `outFile`. */
export async function bundleTest(testFile, outFile) {
  const name = rel(testFile);
  const src = `import ${JSON.stringify(preludePath)};
import { __runCollected, __collectError } from "vitest";
let collected = true;
try {
  await import(${JSON.stringify(testFile)});
} catch (e) {
  collected = false;
  __collectError(${JSON.stringify(name)}, e);
}
if (collected) await __runCollected(${JSON.stringify(name)});
`;
  return bundleEntry(src, outFile);
}

/** Bundle a benchmark module (exports `benchmarks`) into `outFile`. */
export async function bundleBench(benchFile, outFile) {
  const src = `import ${JSON.stringify(preludePath)};
export * from ${JSON.stringify(benchFile)};
`;
  return bundleEntry(src, outFile);
}

export function outName(file) {
  return rel(file).replace(/[\/]/g, "__").replace(/\.ts$/, ".mjs");
}

export function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}
