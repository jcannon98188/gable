// Builds the extension into a .vsix, locally. Nothing here publishes.
//
// vsce never packs a top-level node_modules except through `dependencies`, and tsserver finds
// a contributed plugin by name in node_modules. So the extension is staged in a scratch
// directory where the bundled plugin is installed as a real dependency, then packed from there.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createVSIX } from "@vscode/vsce";
import { buildPlugin } from "../language-service/build-plugin.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const PLUGIN = "gable-vscode-plugin";

/** Bundles the tsserver plugin (with TypeScript inlined) as a package named `PLUGIN` under `dir`. */
export async function buildPluginPackage(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: PLUGIN, version: "0.0.0", main: "index.cjs" }, null, 2));
  await buildPlugin({ outFile: path.join(dir, "index.cjs"), bundleTypescript: true, minify: true });
}

/** Packs the extension and returns the path of the .vsix. */
export async function packageExtension(outDir) {
  const stage = mkdtempSync(path.join(tmpdir(), "gable-vscode-"));
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    delete manifest.scripts;
    delete manifest.devDependencies;
    delete manifest.type;
    manifest.dependencies = { [PLUGIN]: "file:./plugin" };
    writeFileSync(path.join(stage, "package.json"), JSON.stringify(manifest, null, 2));
    cpSync(path.join(root, "syntaxes"), path.join(stage, "syntaxes"), { recursive: true });
    writeFileSync(path.join(stage, ".vscodeignore"), "plugin/**\n");
    await buildPluginPackage(path.join(stage, "plugin"));
    execFileSync("npm", ["install", "--omit=dev", "--install-links", "--no-audit", "--no-fund", "--package-lock=false"], { cwd: stage, stdio: "inherit", shell: true });
    mkdirSync(outDir, { recursive: true });
    const packagePath = path.join(outDir, `${manifest.name}-${manifest.version}.vsix`);
    await createVSIX({ cwd: stage, packagePath, allowMissingRepository: true, skipLicense: true });
    return packagePath;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--package")) console.log(`Wrote ${await packageExtension(path.join(root, "dist"))}`);
  else await buildPluginPackage(path.join(root, "dist", "plugin"));
}
