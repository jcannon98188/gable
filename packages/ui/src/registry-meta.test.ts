import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMPONENT_META, LIB_META } from "./registry-meta.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");
const specifiers = (source: string) => [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();

describe("registry-meta", () => {
  it("registers every component file, and only existing ones", () => {
    const onDisk = readdirSync(join(here, "components")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sorted(COMPONENT_META.flatMap((c) => c.files))).toEqual(sorted(onDisk));
    expect(sorted(LIB_META.map((l) => l.file))).toEqual(sorted(readdirSync(join(here, "lib")).filter((f) => f.endsWith(".ts"))));
  });

  it("matches what each component really imports", () => {
    const names = new Set(COMPONENT_META.map((c) => c.name));
    const libs = new Set(LIB_META.map((l) => l.name));
    for (const c of COMPONENT_META) {
      const imports = c.files.flatMap((f) => specifiers(read(`components/${f}`)));
      const lib = imports.flatMap((s) => s.match(/^\.\.\/lib\/(.+)\.js$/)?.[1] ?? []);
      const siblings = imports.flatMap((s) => s.match(/^\.\/(.+)\.js$/)?.[1] ?? []);
      const npm = imports.filter((s) => !s.startsWith(".")).map((s) => (s.startsWith("@gable/core") ? "@gable/core" : s));
      expect({ name: c.name, lib: sorted(lib) }).toEqual({ name: c.name, lib: c.lib });
      expect({ name: c.name, registryDependencies: sorted(siblings) }).toEqual({ name: c.name, registryDependencies: c.registryDependencies });
      expect({ name: c.name, dependencies: sorted(npm) }).toEqual({ name: c.name, dependencies: c.dependencies });
      for (const dep of c.registryDependencies) expect(names.has(dep)).toBe(true);
      for (const l of c.lib) expect(libs.has(l)).toBe(true);
      for (const e of c.exports) expect(read(`components/${c.files[0]}`)).toMatch(new RegExp(`export (class|const|function|interface|type) ${e}\\b`));
    }
  });

  it("matches what each lib module really imports", () => {
    for (const l of LIB_META) {
      const imports = specifiers(read(`lib/${l.file}`));
      const npm = imports.filter((s) => !s.startsWith(".")).map((s) => (s.startsWith("@gable/core") ? "@gable/core" : s));
      const lib = imports.flatMap((s) => s.match(/^\.\/(.+)\.js$/)?.[1] ?? []);
      expect({ name: l.name, dependencies: sorted(npm), lib: sorted(lib) }).toEqual({ name: l.name, dependencies: l.dependencies, lib: l.lib });
    }
  });
});
