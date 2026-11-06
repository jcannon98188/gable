import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "./index.js";

let cwd: string;
beforeEach(() => void (cwd = mkdtempSync(join(tmpdir(), "create-gable-cli-"))));
afterEach(() => rmSync(cwd, { recursive: true, force: true, maxRetries: 5 }));

function run(argv: string[], env: Record<string, string> = {}, answer = "") {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const done = main(argv, env, { stdout: (t) => out.push(t), stderr: (t) => err.push(t), ask: async (q) => (asked.push(q), answer) }, cwd);
  return done.then((code) => ({ code, out: out.join(""), err: err.join(""), asked }));
}
const read = (...p: string[]) => readFileSync(join(cwd, ...p), "utf8");

describe("create-gable", () => {
  it("copies the starter, pins @gable/* to its own version and ships no lockfile", async () => {
    const { code } = await run(["my-app"]);
    expect(code).toBe(0);
    const pkg = JSON.parse(read("my-app", "package.json"));
    expect(pkg.name).toBe("my-app");
    const own = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
    const gable = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([n]) => n.startsWith("@gable/"));
    expect(gable.length).toBeGreaterThan(0);
    for (const [, range] of gable) expect(range).toBe(`~${own}`);
    expect(Object.keys(pkg.scripts)).toEqual(["dev", "build", "preview", "test", "check", "format"]);
    expect(existsSync(join(cwd, "my-app", "package-lock.json"))).toBe(false);
    expect(read("my-app", ".gitignore")).toContain("node_modules");
    expect(read("my-app", "index.html")).toContain("<title>my-app</title>");
    expect(read("my-app", "README.md")).not.toContain("{{");
  });

  it("prints the commands of the invoking package manager", async () => {
    const pnpm = await run(["a-app"], { npm_config_user_agent: "pnpm/10.0.0 npm/? node/v24 win32 x64" });
    expect(pnpm.out).toContain("pnpm install");
    expect(pnpm.out).toContain("pnpm dev");
    expect(read("a-app", "README.md")).toContain("pnpm test");
    const npm = await run(["b-app"], { npm_config_user_agent: "npm/11.0.0 node/v24 win32 x64" });
    expect(npm.out).toContain("npm run dev");
    const none = await run(["c-app"]);
    expect(none.out).toContain("npm install");
  });

  it("asks only for a project name when none is given", async () => {
    const result = await run([], {}, "asked-app");
    expect(result.asked).toHaveLength(1);
    expect(existsSync(join(cwd, "asked-app", "src", "main.ts"))).toBe(true);
  });

  it("has no options beyond --help and --local", async () => {
    expect((await run(["--help"])).out).toContain("Usage:");
    const bad = await run(["--typescript", "x"]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("unknown option");
  });

  it("refuses a non-empty target directory and an invalid name", async () => {
    mkdirSync(join(cwd, "taken"));
    writeFileSync(join(cwd, "taken", "file"), "x");
    expect((await run(["taken"])).code).toBe(1);
    const invalid = await run(["Bad Name"]);
    expect(invalid.code).toBe(1);
    expect(invalid.err).toContain("not a valid package name");
  });

  describe("--local", () => {
    const fake = (...names: string[]) => {
      const dir = join(cwd, "vendor");
      mkdirSync(dir);
      for (const n of names) writeFileSync(join(dir, n), "");
      return dir;
    };
    const all = ["core", "renderer-dom", "testing", "vite", "language-service", "prettier-plugin", "template-format"].map((n) => `gable-${n}-1.2.3.tgz`);

    it("points @gable/* at the tarballs and overrides every one of them", async () => {
      const dir = fake(...all, "create-gable-1.2.3.tgz");
      const result = await run(["--local", dir, "my-app"]);
      expect(result.code).toBe(0);
      const pkg = JSON.parse(read("my-app", "package.json"));
      const spec = (n: string) => `file:${dir.split(sep).join("/")}/gable-${n}-1.2.3.tgz`;
      expect(pkg.dependencies["@gable/core"]).toBe(spec("core"));
      expect(pkg.devDependencies["@gable/vite"]).toBe(spec("vite"));
      expect(pkg.dependencies.rxjs).toBe("^7.8.2");
      expect(Object.keys(pkg.overrides).sort()).toEqual(
        ["core", "language-service", "prettier-plugin", "renderer-dom", "template-format", "testing", "vite"].map((n) => `@gable/${n}`),
      );
      expect(pkg.overrides["@gable/template-format"]).toBe(spec("template-format"));
    });

    it("accepts --local=<dir> and a relative directory", async () => {
      fake(...all);
      expect((await run(["my-app", "--local=vendor"])).code).toBe(0);
      expect(JSON.parse(read("my-app", "package.json")).dependencies["@gable/core"]).toMatch(/^file:.*\/vendor\/gable-core-1\.2\.3\.tgz$/);
    });

    it("fails before writing anything when a tarball is missing, the directory is absent or the value is missing", async () => {
      const dir = fake(...all.filter((f) => !f.includes("-vite-")));
      const missing = await run(["--local", dir, "my-app"]);
      expect(missing.code).toBe(1);
      expect(missing.err).toContain("no tarball for @gable/vite");
      expect(existsSync(join(cwd, "my-app"))).toBe(false);
      expect((await run(["--local", join(cwd, "nope"), "my-app"])).err).toContain("not a directory");
      expect((await run(["my-app", "--local"])).code).toBe(2);
    });
  });
});
