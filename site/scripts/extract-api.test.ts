import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without declarations
import { SKIP, buildIndex, extractPackage, resolveEntryPoints, run } from "./extract-api.mjs";
import type { ApiEntryPoint, ApiPackage, ApiSymbol } from "../src/generated/api-schema";

const here = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.join(here, "__fixtures__", "packages");
const demoDir = path.join(packagesDir, "demo");

let api: ApiPackage;
const entry = (p: string): ApiEntryPoint => api.entryPoints.find((e) => e.path === p)!;
const sym = (name: string, ep = "@fixture/demo"): ApiSymbol => entry(ep).symbols.find((s) => s.name === name)!;

beforeAll(() => {
  const result = extractPackage(demoDir);
  api = result.api;
}, 60_000);

describe("entry points", () => {
  it("resolves the exports map, mapping .js targets to .d.ts and skipping non-TS entries", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(demoDir, "package.json"), "utf8"));
    const { entries } = resolveEntryPoints(demoDir, pkg);
    expect(entries.map((e: { path: string }) => e.path)).toEqual(["@fixture/demo", "@fixture/demo/extra"]);
  });

  it("emits package metadata and a subpath entry point", () => {
    expect(api).toMatchObject({ name: "@fixture/demo", slug: "demo", version: "1.2.3" });
    expect(api.entryPoints.map((e) => e.path)).toEqual(["@fixture/demo", "@fixture/demo/extra"]);
    expect(sym("extra", "@fixture/demo/extra")).toMatchObject({
      id: "@fixture/demo/extra#extra",
      kind: "function",
      summary: "Runs the extra thing.",
    });
  });

  it("skips a package with no declaration entry points", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-skip-"));
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", version: "1.0.0" }));
    expect(extractPackage(dir).skipped).toBeTruthy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("skips application packages on purpose, with the reason in the summary", () => {
    const packages = fs.mkdtempSync(path.join(os.tmpdir(), "api-apps-"));
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "api-apps-out-"));
    for (const name of Object.keys(SKIP)) {
      const dir = path.join(packages, name.replace(/[^a-z]/g, "-"));
      fs.mkdirSync(dir);
      // An exports map that points at missing declarations would throw if the package were not skipped first.
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", exports: { ".": { types: "./dist/none.d.ts" } } }));
      expect(extractPackage(dir).skipped).toBe(SKIP[name as keyof typeof SKIP]);
    }
    const lines: string[] = [];
    run({ packagesDir: packages, outDir: out, log: (l: string) => lines.push(l) });
    expect(lines.join("\n")).toContain("skipped gable-vscode: application, not a library");
    expect(Object.keys(SKIP).sort()).toEqual(["@gable/designer", "@gable/devtools-extension", "gable-vscode"]);
    fs.rmSync(packages, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  });

  it("fails with a build hint when declarations are missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-missing-"));
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", exports: { ".": { types: "./dist/index.d.ts" } } }),
    );
    expect(() => extractPackage(dir)).toThrow(/Build the packages first/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("symbols", () => {
  it("follows export *, export { x } from and export * as", () => {
    const names = entry("@fixture/demo").symbols.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(["Shared", "sharedConst", "fromStar", "ns"]));
    expect(sym("Shared")).toMatchObject({ kind: "interface", summary: "A value shared with another module." });
    expect(sym("ns").kind).toBe("namespace");
    expect(sym("ns").members?.map((m) => m.name)).toEqual(["fromStar"]);
  });

  it("orders symbols by kind group, then name", () => {
    const kinds = entry("@fixture/demo").symbols.map((s) => s.kind);
    const order = ["class", "function", "interface", "type", "const", "enum", "namespace", "variable"];
    const idx = kinds.map((k) => order.indexOf(k));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    const fns = entry("@fixture/demo").symbols.filter((s) => s.kind === "function").map((s) => s.name);
    expect(fns).toEqual([...fns].sort());
  });

  it("omits @internal symbols and members, and private/protected members", () => {
    expect(entry("@fixture/demo").symbols.some((s) => s.name === "hiddenFn")).toBe(false);
    const names = sym("Counter").members!.map((m) => m.name);
    expect(names).not.toContain("internalField");
    expect(names).not.toContain("secret");
    expect(names).not.toContain("hidden");
  });

  it("documents a generic class with heritage, examples, remarks and links", () => {
    const c = sym("Counter");
    expect(c.id).toBe("@fixture/demo#Counter");
    expect(c.kind).toBe("class");
    expect(c.signature).toBe("class Counter<T extends number = number> extends Base implements Shared");
    expect(c.extends).toEqual(["Base"]);
    expect(c.implements).toEqual(["Shared"]);
    expect(c.typeParams).toEqual([{ name: "T", constraint: "number", description: "" }]);
    expect(c.summary).toBe("A counter. See `Shared` and something else.");
    expect(c.remarks).toContain("Longer remarks live in the second paragraph.");
    expect(c.remarks).toContain("Also a remarks tag.");
    expect(c.examples).toEqual(["const c = new Counter(1);\nc.inc();", "new Counter(2)"]);
    expect(c.see).toEqual(["@fixture/demo#Shared", "nothing"]);
  });

  it("describes members: overloads joined, accessors paired, statics, readonly, index, deprecated", () => {
    const members = sym("Counter").members!;
    const by = (n: string) => members.find((m) => m.name === n)!;
    expect(members.map((m) => m.name)).toEqual(["id", "created", "constructor", "inc", "value", "readOnly", "[index]", "old"]);
    expect(by("id")).toMatchObject({ kind: "property", readonly: true, static: false, summary: "The id." });
    expect(by("created")).toMatchObject({ static: true, signature: "static created: number" });
    expect(by("constructor")).toMatchObject({ kind: "constructor", summary: "Starts at `start`." });
    expect(by("inc").signature).toBe("inc(by?: number): T\ninc(by: string): string");
    expect(by("inc").params).toEqual([{ name: "by", type: "number", description: "how much", optional: true }]);
    expect(by("inc").returns).toEqual({ type: "T", description: "the new value" });
    expect(by("value")).toMatchObject({ kind: "accessor", readonly: false });
    expect(by("readOnly")).toMatchObject({ kind: "accessor", readonly: true });
    expect(by("[index]").kind).toBe("index");
    expect(by("old").deprecated).toBe("use inc");
  });

  it("documents generic functions with params, returns and type params", () => {
    const f = sym("map");
    expect(f.signature).toBe("function map<T, U extends object>(value: T, fn: (v: T) => U): U");
    expect(f.params).toEqual([
      { name: "value", type: "T", description: "the input value", optional: false },
      { name: "fn", type: "(v: T) => U", description: "mapper", optional: false },
    ]);
    expect(f.returns).toEqual({ type: "U", description: "mapped" });
    expect(f.typeParams).toEqual([
      { name: "T", description: "input" },
      { name: "U", constraint: "object", description: "" },
    ]);
  });

  it("joins overload signatures into one symbol", () => {
    const f = sym("pick");
    expect(entry("@fixture/demo").symbols.filter((s) => s.name === "pick")).toHaveLength(1);
    expect(f.signature).toBe("function pick(a: string): string\nfunction pick(a: number): number");
    expect(f.summary).toBe("Overloaded.");
  });

  it("reads deprecation on type aliases and keeps one-line type signatures", () => {
    expect(sym("Old")).toMatchObject({ kind: "type", deprecated: "Use `Counter`.", signature: "type Old = Counter" });
    expect(sym("Mode").signature).toBe('type Mode = "a" | "b"');
    expect(sym("AliasMode").name).toBe("AliasMode");
  });

  it("merges declarations: const + interface, function + namespace", () => {
    const merged = sym("Merged");
    expect(merged.kind).toBe("const");
    expect(merged.signature).toContain("const Merged");
    expect(merged.signature).toContain("interface Merged");
    const fn = sym("fnNs");
    expect(fn.kind).toBe("function");
    expect(fn.members?.map((m) => `${m.kind}:${m.name}`)).toEqual(["method:helper", "property:flag"]);
    expect(fn.members?.[0].returns?.type).toBe("string");
  });

  it("covers enums, const and let", () => {
    const e = sym("Color");
    expect(e.kind).toBe("enum");
    expect(e.members?.map((m) => [m.name, m.kind, m.signature])).toEqual([
      ["Red", "enum-member", "Red = 1"],
      ["Green", "enum-member", "Green = 2"],
    ]);
    expect(sym("answer")).toMatchObject({ kind: "const", signature: "const answer = 42" });
    expect(sym("counter")).toMatchObject({ kind: "variable", signature: "let counter: number" });
  });
});

describe("index and reporting", () => {
  it("counts symbols and undocumented symbols", () => {
    const index = buildIndex([api]);
    const entryCount = api.entryPoints.flatMap((e) => e.symbols);
    expect(index.packages[0]).toMatchObject({
      name: "@fixture/demo",
      slug: "demo",
      entryPoints: ["@fixture/demo", "@fixture/demo/extra"],
      symbolCount: entryCount.length,
      undocumentedCount: entryCount.filter((s) => !s.summary).length,
    });
    expect(index.packages[0].undocumentedCount).toBeGreaterThan(0);
  });

  it("writes <slug>.json and index.json, and reports undocumented symbols", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "api-out-"));
    const lines: string[] = [];
    const { undocumented } = run({ packagesDir, outDir: out, log: (l: string) => lines.push(l) });
    expect(fs.readdirSync(out).sort()).toEqual(["demo.json", "index.json"]);
    expect(JSON.parse(fs.readFileSync(path.join(out, "demo.json"), "utf8")).slug).toBe("demo");
    expect(undocumented).toContain("@fixture/demo#undocumented");
    expect(lines.join("\n")).toMatch(/@fixture\/demo\s+2\s+\d+\s+\d+/);
    fs.rmSync(out, { recursive: true, force: true });
  });

  it("--strict exits non-zero when symbols are undocumented, default does not", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "api-cli-"));
    const script = path.join(here, "extract-api.mjs");
    const args = [script, "--packages", packagesDir, "--out", out];
    expect(spawnSync(process.execPath, args, { encoding: "utf8" }).status).toBe(0);
    const strict = spawnSync(process.execPath, [...args, "--strict"], { encoding: "utf8" });
    expect(strict.status).toBe(1);
    expect(strict.stdout).toContain("@fixture/demo#undocumented");
    fs.rmSync(out, { recursive: true, force: true });
  });
});
