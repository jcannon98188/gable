#!/usr/bin/env node
// Bundle one test file for a manual run:
//   node native/engine-harness/js/bundle-one.mjs <file.test.ts> <out.mjs>
//   native/engine-harness/target/release/gable-harness run <out.mjs>
import path from "node:path";
import { bundleTest } from "./bundle.mjs";

const [file, out] = process.argv.slice(2);
const nodeImports = await bundleTest(path.resolve(file), path.resolve(out));
if (nodeImports.length) console.error(`imports Node built-ins: ${nodeImports.join(", ")}`);
