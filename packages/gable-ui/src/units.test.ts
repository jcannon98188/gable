import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { destinationOf, rewriteFile } from "./commands.js";
import { parseConfig, readConfig, writeConfig, DEFAULT_CONFIG } from "./config.js";
import { cssFor, ensureImports, upsertBlock } from "./css.js";
import { findImports, packageOf, rewriteImports } from "./imports.js";
import { detectPackageManager, mergeDependencies } from "./manifest.js";
import { tempDir } from "./test-fixtures.js";

const dirs: string[] = [];
const temp = () => (dirs[dirs.length] = tempDir());
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("import scanning", () => {
  it("finds static, export-from, side-effect and dynamic imports but not ones in comments", () => {
    const source = `
      import a from "one";
      import { b } from 'two/sub';
      export * from "./three.js";
      import "four";
      const x = await import("five");
      // import z from "commented";
      /** import { y } from "docs" */
    `;
    expect(findImports(source).map((r) => r.specifier)).toEqual(["one", "two/sub", "./three.js", "four", "five"]);
  });

  it("maps specifiers to npm packages", () => {
    expect(packageOf("@gable/core/hmr")).toBe("@gable/core");
    expect(packageOf("clsx")).toBe("clsx");
    expect(packageOf("lucide/dist/x")).toBe("lucide");
    expect(packageOf("node:fs")).toBeUndefined();
    expect(packageOf("fs")).toBeUndefined();
    expect(packageOf("./x.js")).toBeUndefined();
  });

  it("rewrites only the specifiers it is given a replacement for, leaving the rest byte for byte", () => {
    const source = `import { a } from "./a.js"; // "./a.js"\nimport b from 'b';\n`;
    expect(rewriteImports(source, (s) => (s === "./a.js" ? "../x/a.js" : undefined))).toBe(`import { a } from "../x/a.js"; // "./a.js"\nimport b from 'b';\n`);
  });
});

describe("rewriting imports to the project's paths", () => {
  const config = { ...DEFAULT_CONFIG, componentsDir: "src/ui", utilsDir: "src/lib/helpers" };
  const sources = new Map([
    ["components/dialog.ts", "src/ui/dialog.ts"],
    ["components/button.ts", "src/ui/button.ts"],
    ["lib/cn.ts", "src/lib/helpers/cn.ts"],
  ]);

  it("places files by their registry directory", () => {
    expect(destinationOf("components/button.ts", config)).toBe("src/ui/button.ts");
    expect(destinationOf("lib/cn.ts", config)).toBe("src/lib/helpers/cn.ts");
    expect(destinationOf("components/deep/x.ts", config)).toBe("src/ui/deep/x.ts");
    expect(() => destinationOf("other/x.ts", config)).toThrow(/Unsupported/);
  });

  it("points relative imports at where the files landed, keeping the .js extension style", () => {
    const source = `import { cn } from "../lib/cn.js";\nimport { b } from "./button.js";\nimport { input } from "@gable/core";\n`;
    expect(rewriteFile(source, "components/dialog.ts", sources)).toBe(`import { cn } from "../lib/helpers/cn.js";\nimport { b } from "./button.js";\nimport { input } from "@gable/core";\n`);
  });

  it("handles extensionless specifiers, same-directory targets and nested destinations", () => {
    const nested = new Map([["components/a.ts", "app/ui/a.ts"], ["lib/cn.ts", "app/ui/cn.ts"]]);
    expect(rewriteFile(`import "../lib/cn";`, "components/a.ts", nested)).toBe(`import "./cn";`);
    const deep = new Map([["components/a.ts", "app/ui/a.ts"], ["lib/cn.ts", "app/lib/ui/cn.ts"]]);
    expect(rewriteFile(`import "../lib/cn.js";`, "components/a.ts", deep)).toBe(`import "../lib/ui/cn.js";`);
  });

  it("leaves an import it cannot map alone and reports it", () => {
    const missed: string[] = [];
    expect(rewriteFile(`import "../lib/unknown.js";`, "components/a.ts", new Map([["components/a.ts", "src/a.ts"]]), (s) => missed.push(s))).toBe(`import "../lib/unknown.js";`);
    expect(missed).toEqual(["../lib/unknown.js"]);
  });
});

describe("gable-ui.json", () => {
  it("fills defaults, normalises paths and keeps the registry", () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG);
    expect(parseConfig({ componentsDir: "./app\\ui/", utilsDir: "app/lib", registry: "../reg" })).toMatchObject({ componentsDir: "app/ui", utilsDir: "app/lib", registry: "../reg" });
  });

  it("rejects paths outside the project, equal directories and wrong types", () => {
    expect(() => parseConfig({ componentsDir: "../out" })).toThrow(/inside the project/);
    expect(() => parseConfig({ css: "/abs/x.css" })).toThrow(/inside the project/);
    expect(() => parseConfig({ utilsDir: "src/components/ui" })).toThrow(/must differ/);
    expect(() => parseConfig({ baseColor: 3 })).toThrow(/non-empty string/);
    expect(() => parseConfig([])).toThrow(/JSON object/);
  });

  it("round-trips through the file and reports bad JSON", () => {
    const dir = temp();
    expect(readConfig(dir)).toBeUndefined();
    writeConfig(dir, { ...DEFAULT_CONFIG, baseColor: "slate" });
    expect(readConfig(dir)).toEqual({ ...DEFAULT_CONFIG, baseColor: "slate" });
    writeFileSync(join(dir, "gable-ui.json"), "{nope");
    expect(() => readConfig(dir)).toThrow(/not valid JSON/);
  });
});

describe("stylesheet edits", () => {
  it("renders variables for light and dark plus raw CSS", () => {
    expect(cssFor({ cssVars: { light: { "--a": "1", b: "2" }, dark: { "--a": "3" } }, css: "@keyframes x {}\n" })).toBe(":root {\n  --a: 1;\n  --b: 2;\n}\n\n.dark {\n  --a: 3;\n}\n\n@keyframes x {}\n");
    expect(cssFor({})).toBe("");
  });

  it("appends a marked block once and replaces it afterwards, leaving the rest alone", () => {
    const once = upsertBlock("body { margin: 0 }\n", "button", ":root { --x: 1 }");
    expect(once).toBe("body { margin: 0 }\n\n/* gable-ui:button */\n:root { --x: 1 }\n/* /gable-ui:button */\n");
    const twice = upsertBlock(once + "a { }\n", "button", ":root { --x: 2 }");
    expect(twice).toBe("body { margin: 0 }\n\n/* gable-ui:button */\n:root { --x: 2 }\n/* /gable-ui:button */\na { }\n");
    expect(upsertBlock(twice, "button", ":root { --x: 2 }")).toBe(twice);
  });

  it("adds only the missing @imports, at the top", () => {
    expect(ensureImports("", ["tailwindcss", "tw-animate-css"])).toBe('@import "tailwindcss";\n@import "tw-animate-css";\n');
    expect(ensureImports('@import "tailwindcss";\n\nbody {}\n', ["tailwindcss", "tw-animate-css"])).toBe('@import "tw-animate-css";\n\n@import "tailwindcss";\n\nbody {}\n');
    const done = '@import url("tw-animate-css");\n@import \'tailwindcss\';\n';
    expect(ensureImports(done, ["tailwindcss", "tw-animate-css"])).toBe(done);
  });
});

describe("package.json edits", () => {
  const manifest = JSON.stringify({ name: "app", dependencies: { clsx: "^2.0.0" }, devDependencies: { vite: "^8.0.0" } }, null, 2) + "\n";

  it("adds only packages the project does not list, sorted, keeping the indent", () => {
    const { text, added } = mergeDependencies(manifest, { dependencies: { clsx: "^9.0.0", lucide: "^1.0.0" }, devDependencies: { vite: "^1.0.0", tailwindcss: "^4.0.0" } });
    expect(added).toEqual(["lucide@^1.0.0", "tailwindcss@^4.0.0"]);
    expect(JSON.parse(text)).toMatchObject({ dependencies: { clsx: "^2.0.0", lucide: "^1.0.0" }, devDependencies: { tailwindcss: "^4.0.0", vite: "^8.0.0" } });
    expect(text.startsWith('{\n  "name"')).toBe(true);
  });

  it("returns the text untouched when there is nothing to add", () => {
    expect(mergeDependencies(manifest, { dependencies: { clsx: "^2.0.0" } })).toEqual({ text: manifest, added: [] });
  });

  it("with a local tarball directory points @gable/* at the tarballs and overrides them all", () => {
    const dir = temp();
    for (const f of ["gable-core-0.0.0.tgz", "gable-ui-primitives-0.0.0.tgz", "gable-ui-0.0.0.tgz"]) writeFileSync(join(dir, f), "");
    const { text } = mergeDependencies(manifest, { dependencies: { "@gable/ui-primitives": "~0.0.0" } }, dir);
    const spec = (f: string) => `file:${join(dir, f).replace(/\\/g, "/")}`;
    const parsed = JSON.parse(text);
    expect(parsed.dependencies["@gable/ui-primitives"]).toBe(spec("gable-ui-primitives-0.0.0.tgz"));
    expect(parsed.overrides).toEqual({
      "@gable/core": spec("gable-core-0.0.0.tgz"),
      "@gable/ui": spec("gable-ui-0.0.0.tgz"),
      "@gable/ui-primitives": spec("gable-ui-primitives-0.0.0.tgz"),
    });
    expect(() => mergeDependencies(manifest, { dependencies: { "@gable/missing": "~0.0.0" } }, dir)).toThrow(/no tarball for @gable\/missing/);
    expect(() => mergeDependencies(manifest, { dependencies: { x: "1" } }, join(dir, "nope"))).toThrow(/not a directory/);
  });

  it("detects the package manager from a lockfile, then the user agent", () => {
    const dir = temp();
    expect(detectPackageManager(dir, "pnpm/9.0.0")).toBe("pnpm");
    expect(detectPackageManager(dir)).toBe("npm");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "yarn.lock"), "");
    expect(detectPackageManager(dir, "pnpm/9.0.0")).toBe("yarn");
    expect(readFileSync(join(dir, "yarn.lock"), "utf8")).toBe("");
  });
});
