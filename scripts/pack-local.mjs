// Packs the publishable packages into an app's vendor/ directory and points the app at them.
//
//   node scripts/pack-local.mjs [app-dir] [--no-build] [--no-update]
//
// app-dir defaults to examples/todomvc. Steps: build the workspace, delete stale tarballs from <app>/vendor,
// `npm pack` every non-private package there, and rewrite the app's package.json so each @gable/* dependency is
// `file:vendor/<tarball>` and `overrides` pins every @gable/* package the app (transitively) needs, because the
// packages depend on each other at the lockstep version. With --no-update the package.json is left alone and the
// entries to add are printed instead.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Non-private workspace packages (and private ones flagged `"gablePack": true`, like @gable/ui): `{ name, dir }`. */
export function publishablePackages(repo = root) {
  const packagesDir = join(repo, "packages");
  return readdirSync(packagesDir)
    .map((dir) => join(packagesDir, dir))
    .filter((dir) => existsSync(join(dir, "package.json")))
    .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) }))
    .filter(({ manifest }) => !manifest.private || manifest.gablePack)
    .map(({ dir, manifest }) => ({ name: manifest.name, dir, manifest }));
}

/** Tarball file name `npm pack` produces for a package. */
export const tarballName = (name, version) => `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;

/**
 * The dependency and overrides entries that make `manifest` install `packed` (name to tarball file) from `vendor/`.
 * Every packed @gable/* package is overridden (npm ignores overrides for packages not in the tree), so the ones the
 * app only reaches transitively, such as @gable/template-format, resolve to the same tarballs.
 */
export function localEntries(manifest, packed, vendorSpec = "vendor") {
  const spec = (name) => `file:${vendorSpec}/${packed.get(name)}`;
  const dependencies = {};
  for (const field of ["dependencies", "devDependencies"]) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (packed.has(name)) dependencies[field] = { ...dependencies[field], [name]: spec(name) };
    }
  }
  const overrides = Object.fromEntries([...packed.keys()].filter((n) => n.startsWith("@gable/")).sort().map((name) => [name, spec(name)]));
  return { dependencies, overrides };
}

export function packLocal({ app, build = true, update = true, log = console.log }) {
  const packages = publishablePackages();
  if (build) {
    log("Building the workspace...");
    execSync("npm run build", { cwd: root, stdio: "inherit" });
  }
  const vendor = join(app, "vendor");
  mkdirSync(vendor, { recursive: true });
  // Tarballs of an older version of our packages would otherwise linger.
  for (const file of readdirSync(vendor)) if (/^(gable-.*|create-gable-.*)\.tgz$/.test(file)) rmSync(join(vendor, file));
  const packed = new Map();
  for (const { name, dir, manifest } of packages) {
    const out = execSync(`npm pack "${dir}" --pack-destination "${vendor}" --silent`, { cwd: root, encoding: "utf8" }).trim().split("\n").pop();
    packed.set(name, out);
    log(`  packed ${out}`);
  }
  const file = join(app, "package.json");
  const manifest = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const { dependencies, overrides } = localEntries(manifest, packed);
  if (update) {
    for (const [field, deps] of Object.entries(dependencies)) manifest[field] = { ...manifest[field], ...deps };
    manifest.overrides = { ...manifest.overrides, ...overrides };
    writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
    log(`Updated ${file}. Next: cd "${app}" && npm install`);
    log("If npm reports an EINTEGRITY error for a refreshed tarball, delete the app's package-lock.json and node_modules/@gable and install again.");
  } else {
    log(`Add to ${file}:\n${JSON.stringify({ ...dependencies, overrides }, null, 2)}`);
  }
  return { packed, dependencies, overrides };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const unknown = args.find((a) => a.startsWith("-") && !["--no-build", "--no-update"].includes(a));
  if (unknown) {
    console.error(`pack-local: unknown option "${unknown}"\nUsage: node scripts/pack-local.mjs [app-dir] [--no-build] [--no-update]`);
    process.exit(2);
  }
  const app = resolve(args.find((a) => !a.startsWith("-")) ?? join(root, "examples/todomvc"));
  if (!existsSync(join(app, "package.json")) && !args.includes("--no-update")) {
    console.error(`pack-local: ${app} has no package.json (use --no-update to only fill its vendor/ directory).`);
    process.exit(1);
  }
  packLocal({ app, build: !args.includes("--no-build"), update: !args.includes("--no-update") });
}
