import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Server } from "../../language-service/test-support/tsserver.js";
// @ts-expect-error plain ESM build script
import { packageExtension } from "../build.mjs";

// The extension is built into a real .vsix, unpacked the way VS Code installs it, and the
// bundled tsserver plugin is loaded from there as a global plugin.

const require = createRequire(import.meta.url);
// No @types/yauzl in the repo: the few members used here are typed loosely.
const yauzl = require("yauzl") as any;

function unzip(vsix: string, into: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const names: string[] = [];
    yauzl.open(vsix, { lazyEntries: true }, (err: Error | null, zip: any) => {
      if (err) return reject(err);
      zip.on("error", reject).on("end", () => resolve(names));
      zip.on("entry", (entry: any) => {
        names.push(entry.fileName);
        if (entry.fileName.endsWith("/")) return zip.readEntry();
        zip.openReadStream(entry, (e: Error | null, stream: any) => {
          if (e) return reject(e);
          const target = path.join(into, entry.fileName);
          mkdirSync(path.dirname(target), { recursive: true });
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c)).on("end", () => {
            writeFileSync(target, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

let work: string;
let vsix: string;
let files: string[];
let extension: string;
let server: Server | undefined;

const fixtureDir = fileURLToPath(new URL("../../language-service/fixtures/editor", import.meta.url));

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), "gable-vsix-"));
  vsix = await packageExtension(path.join(work, "out"));
  files = await unzip(vsix, path.join(work, "unpacked"));
  extension = path.join(work, "unpacked", "extension");
}, 300_000);

afterAll(() => {
  server?.stop();
  rmSync(work, { recursive: true, force: true });
});

describe("VS Code extension package", () => {
  it("builds an installable .vsix with the manifest, grammar and plugin", () => {
    expect(vsix).toMatch(/gable-vscode-0\.0\.0\.vsix$/);
    expect(files).toEqual(
      expect.arrayContaining(["extension.vsixmanifest", "extension/package.json", "extension/syntaxes/gable-template.injection.json", "extension/node_modules/gable-vscode-plugin/index.cjs"]),
    );
  });

  it("declares the plugin, the grammar injection and the supported language-service range", () => {
    const manifest = require(path.join(extension, "package.json"));
    expect(manifest.contributes.typescriptServerPlugins).toEqual([{ name: "gable-vscode-plugin", enableForWorkspaceTypeScriptVersions: true }]);
    expect(manifest.contributes.grammars[0]).toMatchObject({ path: "./syntaxes/gable-template.injection.json", injectTo: ["source.ts", "source.tsx"] });
    expect(manifest.gable.languageService).toBe("0.x");
    expect(manifest.engines.vscode).toBeDefined();
  });

  it("ships no source, tests or workspace files", () => {
    expect(files.filter((f) => /\.test\.|\/src\/|build\.mjs|\.ts$/.test(f))).toEqual([]);
  });

  it("loads the bundled plugin into tsserver as a global plugin, with no workspace install", async () => {
    server = new Server(["--globalPlugins", "gable-vscode-plugin", "--pluginProbeLocations", extension]);
    await server.request("configure", { hostInfo: "test" });
    const file = path.join(fixtureDir, "src", "app.ts").replaceAll(path.sep, "/");
    await server.request("open", { file, projectRootPath: fixtureDir });
    const found = (await server.request<any[]>("semanticDiagnosticsSync", { file })).filter((d) => d.source === "gable");
    expect(found.map((d) => d.category).sort()).toEqual(["error", "warning"]);
  }, 120_000);
});
