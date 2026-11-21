// `import sheet from "./hero.json?family"` must type-check: @gablejs/vite ships `client.d.ts` (`/// <reference types="@gablejs/vite/client" />`).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgDir = fileURLToPath(new URL("../", import.meta.url));
const tsc = fileURLToPath(new URL("../../../node_modules/typescript/bin/tsc", import.meta.url));

function typecheck(source: string): { ok: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "gable-vite-types-"));
  try {
    writeFileSync(join(dir, "use.ts"), source);
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: "ESNext", moduleResolution: "Bundler", target: "ES2022", types: [], skipLibCheck: true }, include: ["use.ts"] }));
    try {
      execFileSync(process.execPath, [tsc, "-p", join(dir, "tsconfig.json")], { encoding: "utf8", stdio: "pipe" });
      return { ok: true, output: "" };
    } catch (error) {
      return { ok: false, output: String((error as { stdout?: string }).stdout ?? error) };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("@gablejs/vite client types", () => {
  const clientTypes = join(pkgDir, "client.d.ts").replace(/\\/g, "/");

  it("types a ?family import as a URL string once the client types are referenced", () => {
    const result = typecheck(`/// <reference path="${clientTypes}" />\nimport hero from "./hero.json?family";\nconst url: string = hero;\nexport { url };\n`);
    expect(result.output).toBe("");
    expect(result.ok).toBe(true);
  }, 60_000);

  it("fails without them (so the check above can fail)", () => {
    const result = typecheck(`import hero from "./hero.json?family";\nexport { hero };\n`);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("?family");
  }, 60_000);

  it("is exported as @gablejs/vite/client and shipped in the package", () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    expect(pkg.exports["./client"]).toEqual({ types: "./client.d.ts" });
    expect(pkg.files).toContain("client.d.ts");
  });
});
