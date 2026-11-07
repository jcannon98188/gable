import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRegistry, writeRegistry } from "./registry-build.js";
import { MINI_UI, tempDir, uiDir, writeTree } from "./test-fixtures.js";

const dirs: string[] = [];
const tree = (files: Record<string, string>) => {
  const dir = tempDir();
  dirs.push(dir);
  return writeTree(dir, files);
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("buildRegistry from sources", () => {
  it("makes one item per component and lib file, skips tests, and infers dependencies from imports", async () => {
    const { index, items, warnings } = await buildRegistry({ uiDir: tree(MINI_UI), version: "1.2.3" });
    expect(warnings).toEqual([]);
    expect(index).toMatchObject({ name: "gable-ui", formatVersion: 1, version: "1.2.3", baseColors: ["neutral"] });
    expect(index.items.map((i) => `${i.type}:${i.name}`)).toEqual(["component:button", "component:dialog", "lib:cn", "lib:variants", "style:theme-neutral"]);
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName.button).toMatchObject({
      description: "A button.",
      dependencies: { "@gable/core": "~1.2.3" }, // the commented-out import is ignored; @gable/* follows the lockstep version
      registryDependencies: ["variants"],
      files: [{ path: "components/button.ts" }],
    });
    expect(byName.dialog!.registryDependencies).toEqual(["button", "cn"]);
    expect(byName.dialog!.dependencies).toEqual({ "@gable/core": "~1.2.3" }); // a subpath import is the package
    expect(byName.cn!.dependencies).toEqual({ clsx: "^2.1.1", "tailwind-merge": "^3.7.0" });
  });

  it("turns theme.css into a style item without its header comment", async () => {
    const { items } = await buildRegistry({ uiDir: tree(MINI_UI), version: "1.0.0" });
    const theme = items.find((i) => i.type === "style")!;
    expect(theme).toMatchObject({ name: "theme-neutral", baseColor: "neutral", cssImports: ["tailwindcss", "tw-animate-css"] });
    expect(theme.css).toBe(":root {\n  --background: white;\n}\n");
    expect(Object.keys(theme.devDependencies)).toEqual(["@tailwindcss/vite", "tailwindcss", "tw-animate-css"]);
  });

  it("fails on an import the registry cannot carry or an undeclared package", async () => {
    await expect(buildRegistry({ uiDir: tree({ ...MINI_UI, "src/components/bad.ts": `import "../index.js";\n` }), version: "1.0.0" })).rejects.toThrow(/not part of the registry/);
    await expect(buildRegistry({ uiDir: tree({ ...MINI_UI, "src/components/bad.ts": `import "left-pad";\n` }), version: "1.0.0" })).rejects.toThrow(/left-pad/);
  });

  it("rejects two items with the same name", async () => {
    await expect(buildRegistry({ uiDir: tree({ ...MINI_UI, "src/lib/button.ts": "export {};\n" }), version: "1.0.0" })).rejects.toThrow(/Two registry items are named "button"/);
  });

  it("is deterministic and writes index.json plus items/*.json", async () => {
    const out = tempDir();
    dirs.push(out);
    const built = await buildRegistry({ uiDir: tree(MINI_UI), version: "1.0.0" });
    writeRegistry(built, out);
    const again = await buildRegistry({ uiDir: tree(MINI_UI), version: "1.0.0" });
    expect(again).toEqual(built);
    expect(JSON.parse(readFileSync(join(out, "index.json"), "utf8")).items[0].path).toBe("items/button.json");
    expect(JSON.parse(readFileSync(join(out, "items", "button.json"), "utf8"))).toEqual(built.items[0]);
  });
});

describe("buildRegistry with registry-meta.ts", () => {
  const meta = `export const registryMeta = {
  button: { description: "From meta", dependencies: ["@gable/core"], registryDependencies: ["variants"], cssVars: { light: { "--x": "1" }, dark: { "--x": "2" } } },
  dialog: { files: ["components/dialog.ts"], dependencies: { "@gable/core": "^9.0.0" }, registryDependencies: ["button"] },
};\n`;

  it("takes what the meta states and still infers what it leaves out, warning about the gaps", async () => {
    const { items, warnings } = await buildRegistry({ uiDir: tree({ ...MINI_UI, "src/registry-meta.ts": meta }), version: "1.0.0" });
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName.button).toMatchObject({ description: "From meta", cssVars: { light: { "--x": "1" } } });
    expect(byName.dialog!.dependencies).toEqual({ "@gable/core": "^9.0.0" });
    expect(byName.dialog!.registryDependencies).toEqual(["button"]);
    expect(warnings).toContain('dialog: imports item "cn" but registry-meta.ts does not list it.');
    expect(byName.variants!.registryDependencies).toEqual(["cn"]); // no meta entry: inferred
  });

  it("falls back to inference, with a warning, when the meta cannot be loaded", async () => {
    const { items, warnings } = await buildRegistry({ uiDir: tree({ ...MINI_UI, "src/registry-meta.ts": `throw new Error("boom");\n` }), version: "1.0.0" });
    expect(warnings[0]).toMatch(/registry-meta\.ts could not be loaded \(boom\)/);
    expect(items.find((i) => i.name === "button")!.registryDependencies).toEqual(["variants"]);
  });
});

describe("buildRegistry from packages/ui", () => {
  it("covers every component with consistent dependencies and no warnings", async () => {
    const { items, index, warnings } = await buildRegistry({ uiDir, version: "0.0.0" });
    expect(warnings).toEqual([]);
    const names = new Set(index.items.map((i) => i.name));
    for (const name of ["button", "dialog", "popover", "tabs", "tooltip", "select"]) expect(names.has(name)).toBe(true);
    for (const item of items) for (const dep of item.registryDependencies) expect(names.has(dep)).toBe(true);
    const button = items.find((i) => i.name === "button")!;
    expect(button.registryDependencies).toEqual(expect.arrayContaining(["host-class", "variants"]));
    expect(items.find((i) => i.name === "select")!.dependencies).toHaveProperty("@gable/ui-primitives");
  });
});
