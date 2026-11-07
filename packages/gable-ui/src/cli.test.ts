import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findImports } from "./imports.js";
import { main, type CliIo } from "./index.js";
import { MINI_UI, tempDir, uiDir, writeTree } from "./test-fixtures.js";

/** Runs the CLI in-process against `cwd`, recording output and the installs it asked for. */
async function run(cwd: string, args: string[], env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const installs: string[] = [];
  const io: CliIo = { stdout: (t) => void out.push(t), stderr: (t) => void err.push(t), install: (pm, dir) => (installs.push(`${pm} in ${dir}`), 0) };
  const code = await main(args, env, io, cwd);
  return { code, out: out.join(""), err: err.join(""), installs };
}

/** A fresh Vite project like the create-gable starter: package.json, vite config with Tailwind, an entry, a stylesheet. */
function viteProject(extra: Record<string, string> = {}): string {
  return writeTree(tempDir("gable-ui-app-"), {
    "package.json": JSON.stringify({ name: "app", private: true, type: "module", dependencies: { "@gable/core": "~0.0.0" }, devDependencies: { vite: "^8.3.6" } }, null, 2) + "\n",
    "vite.config.ts": `import tailwindcss from "@tailwindcss/vite";\nimport { defineConfig } from "vite";\nexport default defineConfig({ plugins: [tailwindcss()] });\n`,
    "index.html": `<div id="app"></div><script type="module" src="/src/main.ts"></script>\n`,
    "src/main.ts": `import "./global.css";\n`,
    "src/global.css": `@import "tailwindcss";\n\nbody {\n  margin: 0;\n}\n`,
    ...extra,
  });
}

const dirs: string[] = [];
let registry: string;

beforeAll(async () => {
  registry = tempDir("gable-ui-registry-");
  dirs.push(registry);
  const result = await run(dirname(uiDir), ["build", "--ui", uiDir, "--out", registry]);
  expect(result.code, result.err).toBe(0);
});
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 5 })));

const project = (extra?: Record<string, string>) => (dirs[dirs.length] = viteProject(extra));
const text = (dir: string, file: string) => readFileSync(join(dir, file), "utf8");

describe("gable-ui build", () => {
  it("generates the registry from packages/ui", () => {
    const index = JSON.parse(text(registry, "index.json"));
    expect(index.items.map((i: { name: string }) => i.name)).toEqual(expect.arrayContaining(["button", "dialog", "select", "cn", "variants", "theme-neutral"]));
    const item = JSON.parse(text(registry, "items/button.json"));
    expect(item.files[0].path).toBe("components/button.ts");
    expect(item.files[0].content).toContain("buttonVariants");
  });

  it("builds from a mini source tree given on the command line and prints a summary", async () => {
    const ui = writeTree(tempDir(), MINI_UI);
    dirs.push(ui);
    const result = await run(ui, ["build", "--out", "out"]);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/Wrote 5 items/);
    expect(existsSync(join(ui, "out", "items", "dialog.json"))).toBe(true);
  });
});

describe("gable-ui init then add, end to end in a Vite project", () => {
  let app: string;

  it("init writes the config, the Tailwind setup and the theme, and adds the build dependencies", async () => {
    app = project();
    const result = await run(app, ["init", "--registry", registry]);
    expect(result.code, result.err).toBe(0);
    expect(result.err).toBe(""); // the fixture's vite config already uses @tailwindcss/vite
    expect(JSON.parse(text(app, "gable-ui.json"))).toEqual({ componentsDir: "src/components/ui", utilsDir: "src/lib/ui", css: "src/global.css", baseColor: "neutral", registry });
    const css = text(app, "src/global.css");
    expect(css.startsWith('@import "tw-animate-css";\n\n@import "tailwindcss";')).toBe(true);
    expect(css).toContain("/* gable-ui:theme-neutral */");
    expect(css).toContain("--primary: oklch(0.205 0 0);");
    expect(css).toContain("body {\n  margin: 0;\n}"); // the project's own rules survive
    const manifest = JSON.parse(text(app, "package.json"));
    expect(manifest.devDependencies).toMatchObject({ "tw-animate-css": expect.any(String), tailwindcss: expect.any(String), "@tailwindcss/vite": expect.any(String) });
    expect(result.installs).toEqual([`npm in ${app}`]);
  });

  it("add button copies the component and its helpers, rewrites imports and adds the npm packages", async () => {
    const result = await run(app, ["add", "button"]); // the registry comes from gable-ui.json
    expect(result.code, result.err).toBe(0);
    for (const file of ["src/components/ui/button.ts", "src/lib/ui/variants.ts", "src/lib/ui/cn.ts", "src/lib/ui/host-class.ts"]) expect(existsSync(join(app, file)), file).toBe(true);
    const button = text(app, "src/components/ui/button.ts");
    expect(button).toContain('from "../../lib/ui/host-class.js"');
    expect(button).toContain('from "../../lib/ui/variants.js"');
    expect(button).not.toContain('"../lib/');
    expect(text(app, "src/lib/ui/variants.ts")).toContain('from "./cn.js"');
    const deps = JSON.parse(text(app, "package.json")).dependencies;
    expect(deps).toMatchObject({ "@gable/core": "~0.0.0", clsx: expect.any(String), "tailwind-merge": expect.any(String) });
    expect(deps).not.toHaveProperty("lucide"); // button does not draw icons
    expect(result.installs).toHaveLength(1);
  });

  it("add of a component that needs others pulls in the whole chain, and every relative import resolves", async () => {
    const result = await run(app, ["add", "dialog", "select", "tabs", "tooltip", "popover"]);
    expect(result.code, result.err).toBe(0);
    expect(result.out).toContain("created src/components/ui/dialog.ts");
    expect(existsSync(join(app, "src/lib/ui/icon.ts"))).toBe(true);
    expect(JSON.parse(text(app, "package.json")).dependencies).toMatchObject({ lucide: expect.any(String), "@gable/ui-primitives": expect.any(String) });
    const copied = ["src/components/ui", "src/lib/ui"].flatMap((d) => readdirSync(join(app, d)).map((f) => join(d, f)));
    expect(copied.length).toBeGreaterThan(8);
    for (const file of copied) {
      for (const { specifier } of findImports(text(app, file))) {
        if (!specifier.startsWith(".")) continue;
        const target = resolve(app, dirname(file), specifier.replace(/\.js$/, ".ts"));
        expect(existsSync(target), `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  it("running add again changes nothing; a locally edited file is kept unless --overwrite", async () => {
    const before = text(app, "package.json");
    const again = await run(app, ["add", "button"]);
    expect(again.code).toBe(0);
    expect(again.out).toContain("unchanged src/components/ui/button.ts");
    expect(again.installs).toEqual([]);
    expect(text(app, "package.json")).toBe(before);

    writeFileSync(join(app, "src/components/ui/button.ts"), "// mine\n");
    const kept = await run(app, ["add", "button"]);
    expect(kept.code).toBe(1);
    expect(kept.err).toContain("already exists and differs");
    expect(text(app, "src/components/ui/button.ts")).toBe("// mine\n");
    const replaced = await run(app, ["add", "button", "--overwrite"]);
    expect(replaced.code).toBe(0);
    expect(replaced.out).toContain("overwrote src/components/ui/button.ts");
    expect(text(app, "src/components/ui/button.ts")).toContain("buttonVariants");
  });

  it("init again keeps a hand-edited stylesheet and does not duplicate the theme", async () => {
    const before = text(app, "src/global.css");
    const result = await run(app, ["init"]);
    expect(result.code, result.err).toBe(0);
    expect(text(app, "src/global.css")).toBe(before);
    expect(before.match(/\/\* gable-ui:theme-neutral \*\//g)).toHaveLength(1);
  });
});

describe("gable-ui options", () => {
  it("honours custom directories and a css file that does not exist yet, and --no-install", async () => {
    const app = project();
    dirs.push(app);
    const init = await run(app, ["init", "--registry", registry, "--components-dir", "app/ui", "--utils-dir", "app/helpers", "--css", "app/theme.css", "--no-install"]);
    expect(init.code, init.err).toBe(0);
    expect(text(app, "app/theme.css").startsWith('@import "tailwindcss";\n@import "tw-animate-css";\n')).toBe(true);
    expect(init.installs).toEqual([]);
    const add = await run(app, ["add", "dialog", "--no-install"]);
    expect(add.code, add.err).toBe(0);
    expect(text(app, "app/ui/dialog.ts")).toContain('from "../helpers/cn.js"');
    expect(text(app, "app/ui/dialog.ts")).toContain('"../helpers/icon.js"');
    expect(add.installs).toEqual([]);
    expect(add.out).toContain("skipped installing");
  });

  it("uses the package manager of the project's lockfile", async () => {
    const app = project({ "pnpm-lock.yaml": "" });
    const result = await run(app, ["init", "--registry", registry]);
    expect(result.installs).toEqual([`pnpm in ${app}`]);
  });

  it("warns when the Vite config does not use @tailwindcss/vite", async () => {
    const app = project({ "vite.config.ts": `export default {};\n` });
    const result = await run(app, ["init", "--registry", registry, "--no-install"]);
    expect(result.code).toBe(0);
    expect(result.err).toMatch(/vite\.config\.ts does not use @tailwindcss\/vite/);
  });

  it("with --local points added @gable/* packages at tarballs", async () => {
    const tarballs = writeTree(tempDir(), { "gable-core-0.0.0.tgz": "", "gable-ui-primitives-0.0.0.tgz": "", "gable-renderer-dom-0.0.0.tgz": "" });
    dirs.push(tarballs);
    const app = project();
    await run(app, ["init", "--registry", registry, "--no-install"]);
    const result = await run(app, ["add", "select", "--no-install", "--local", tarballs]);
    expect(result.code, result.err).toBe(0);
    const manifest = JSON.parse(text(app, "package.json"));
    expect(manifest.dependencies["@gable/ui-primitives"]).toBe(`file:${join(tarballs, "gable-ui-primitives-0.0.0.tgz").replace(/\\/g, "/")}`);
    expect(manifest.dependencies["@gable/core"]).toBe("~0.0.0"); // already there: untouched
    expect(Object.keys(manifest.overrides)).toEqual(["@gable/core", "@gable/renderer-dom", "@gable/ui-primitives"]);
  });

  it("reads components straight from a gable-ui source tree", async () => {
    const app = project();
    expect((await run(app, ["init", "--registry", uiDir, "--no-install"])).code).toBe(0);
    const result = await run(app, ["add", "tabs", "--no-install"]);
    expect(result.code, result.err).toBe(0);
    expect(existsSync(join(app, "src/components/ui/tabs.ts"))).toBe(true);
  });

  it("reads components from a git repository", async () => {
    const repo = writeTree(tempDir("gable-ui-git-"), MINI_UI);
    dirs.push(repo);
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: repo, stdio: "pipe" });
    git("init", "-q", "-b", "main");
    git("add", ".");
    git("commit", "-q", "-m", "ui");
    const app = project();
    const url = `file://${repo.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/$1:")}#main`;
    const init = await run(app, ["init", "--registry", url, "--no-install"]);
    expect(init.code, init.err).toBe(0);
    const add = await run(app, ["add", "dialog", "--no-install"]);
    expect(add.code, add.err).toBe(0);
    expect(existsSync(join(app, "src/components/ui/button.ts"))).toBe(true);
    expect(text(app, "src/global.css")).toContain("--background: white;");
  });
});

describe("gable-ui errors", () => {
  it("prints usage for help and exits 2 for unknown commands and options", async () => {
    expect((await run(process.cwd(), ["--help"])).out).toMatch(/Usage: gable-ui/);
    const unknown = await run(process.cwd(), ["frobnicate"]);
    expect([unknown.code, unknown.err]).toEqual([2, expect.stringContaining('unknown command "frobnicate"')]);
    expect((await run(process.cwd(), ["add", "--bogus"])).code).toBe(2);
    expect((await run(process.cwd(), [])).code).toBe(2);
    expect((await run(process.cwd(), ["init", "extra"])).code).toBe(2);
  });

  it("fails clearly outside a project, before init, and for an unknown component", async () => {
    const empty = tempDir();
    dirs.push(empty);
    expect((await run(empty, ["init", "--registry", registry])).err).toMatch(/No package.json/);
    const app = project();
    expect((await run(app, ["add", "button", "--registry", registry])).err).toMatch(/Run "gable-ui init" first/);
    await run(app, ["init", "--registry", registry, "--no-install"]);
    const missing = await run(app, ["add", "nope", "--no-install"]);
    expect(missing.code).toBe(1);
    expect(missing.err).toMatch(/No component named "nope".*Available: .*button/);
    expect((await run(app, ["add", "--no-install"])).err).toMatch(/Name at least one component/);
    expect((await run(app, ["add", "theme-neutral"])).err).toMatch(/is a theme/);
    expect((await run(app, ["init", "--base-color", "zinc", "--no-install"])).err).toMatch(/no theme for base colour "zinc"/);
    expect((await run(app, ["add", "button", "--registry", join(empty, "none")])).err).toMatch(/does not exist/);
    expect((await run(app, ["add", "button", "--registry", empty])).err).toMatch(/holds no registry/);
  });

  it("reports a registry that is missing from the package", async () => {
    const app = project();
    // No --registry and none in gable-ui.json: the bundled registry, which exists only after "npm run build".
    const result = await run(app, ["init", "--no-install"]);
    expect(result.code === 0 || /bundled with gable-ui is missing/.test(result.err)).toBe(true);
  });
});
