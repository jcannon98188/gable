import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { gable } from "./index.js";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "gable-vite-"));
  dirs.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

const resolve = (root: string, command: "serve" | "build" = "serve") =>
  resolveConfig({ root, configFile: false, logLevel: "silent", plugins: [gable()] }, command);

describe("tsconfig fail-fast", () => {
  it("accepts a project with no tsconfig, and one with compatible options", async () => {
    await expect(resolve(project({}))).resolves.toBeTruthy();
    const ok = project({ "tsconfig.json": `// comment\n{ "compilerOptions": { "target": "ES2022", "useDefineForClassFields": true, "strict": true, }, }` });
    await expect(resolve(ok)).resolves.toBeTruthy();
  });

  it("rejects useDefineForClassFields: false, naming the file and the fix", async () => {
    const root = project({ "tsconfig.json": `{ "compilerOptions": { "useDefineForClassFields": false } }` });
    await expect(resolve(root)).rejects.toThrow(/@gable\/vite.*tsconfig\.json.*useDefineForClassFields.*true/s);
  });

  it("rejects decorators and decorator metadata", async () => {
    const a = project({ "tsconfig.json": `{ "compilerOptions": { "experimentalDecorators": true } }` });
    await expect(resolve(a)).rejects.toThrow(/experimentalDecorators/);
    const b = project({ "tsconfig.json": `{ "compilerOptions": { "emitDecoratorMetadata": true } }` });
    await expect(resolve(b)).rejects.toThrow(/emitDecoratorMetadata/);
  });

  it("rejects a target below ES2022 unless class fields are explicitly native", async () => {
    const low = project({ "tsconfig.json": `{ "compilerOptions": { "target": "ES2017" } }` });
    await expect(resolve(low)).rejects.toThrow(/target.*ES2022/s);
    const explicit = project({ "tsconfig.json": `{ "compilerOptions": { "target": "ES2017", "useDefineForClassFields": true } }` });
    await expect(resolve(explicit)).resolves.toBeTruthy();
  });

  it("sees conflicts inherited through extends and project references", async () => {
    const root = project({
      "tsconfig.json": `{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }`,
      "tsconfig.app.json": `{ "extends": "./base/tsconfig.base.json" }`,
      "base/tsconfig.base.json": `{ "compilerOptions": { "useDefineForClassFields": false } }`,
    });
    await expect(resolve(root, "build")).rejects.toThrow(/base[\\/]tsconfig\.base\.json: "useDefineForClassFields"/);
  });
});
