import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain ESM build script
import { buildPlugin } from "../build-plugin.mjs";

// These tests drive a real tsserver over its JSON protocol with the plugin loaded the way a
// user's tsconfig loads it, against fixture projects.

const fixtureDir = fileURLToPath(new URL("../fixtures/editor", import.meta.url));
const file = (name: string) => path.join(fixtureDir, "src", name).replace(/\\/g, "/");
const tsserverJs = createRequire(import.meta.url).resolve("@typescript/old/lib/tsserver.js");

/** Installs the bundled plugin where tsserver's plugin probe finds it. */
export async function installPlugin(probe: string, name = "@gable/language-service") {
  const dir = path.join(probe, "node_modules", ...name.split("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "0.0.0", main: "index.cjs" }));
  await buildPlugin({ outFile: path.join(dir, "index.cjs"), bundleTypescript: true });
}

export class Server {
  private seq = 0;
  private buffer = "";
  private pending = new Map<number, (message: any) => void>();
  private proc: ChildProcessWithoutNullStreams;

  constructor(args: string[] = []) {
    this.proc = spawn(process.execPath, [tsserverJs, "--disableAutomaticTypingAcquisition", ...args], { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout.setEncoding("utf8").on("data", (chunk: string) => this.read(chunk));
  }

  private read(chunk: string) {
    this.buffer += chunk;
    for (;;) {
      const header = /Content-Length: (\d+)\r?\n\r?\n/.exec(this.buffer);
      if (!header) return;
      const start = header.index + header[0].length;
      const length = Number(header[1]);
      if (Buffer.byteLength(this.buffer.slice(start)) < length) return;
      const body = this.buffer.slice(start, start + length);
      this.buffer = this.buffer.slice(start + length);
      const message = JSON.parse(body);
      if (message.type === "response") this.pending.get(message.request_seq)?.(message);
    }
  }

  request<T = any>(command: string, args: object): Promise<T> {
    const seq = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`tsserver timed out on ${command}`)), 60_000);
      this.pending.set(seq, (message) => {
        clearTimeout(timer);
        message.success ? resolve(message.body) : reject(new Error(`${command}: ${message.message}`));
      });
      this.proc.stdin.write(JSON.stringify({ seq, type: "request", command, arguments: args }) + "\n");
    });
  }

  stop() {
    this.proc.kill();
  }
}

/** 1-based tsserver location of `snippet` (plus `into` characters) in a buffer's text. */
function locate(text: string, snippet: string, into = 0) {
  const at = text.indexOf(snippet);
  expect(at, `${snippet} in source`).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, at + into).split("\n");
  return { line: before.length, offset: before[before.length - 1]!.length + 1 };
}

let probe: string;
let server: Server;
const disk = (name: string) => readFileSync(file(name), "utf8");

beforeAll(async () => {
  probe = mkdtempSync(path.join(tmpdir(), "gable-plugin-"));
  await installPlugin(probe);
  server = new Server(["--pluginProbeLocations", probe]);
  await server.request("configure", { hostInfo: "test" });
  for (const name of ["app.ts", "typing.ts", "plain.ts"]) await server.request("open", { file: file(name), projectRootPath: fixtureDir });
}, 120_000);

afterAll(() => {
  server?.stop();
  rmSync(probe, { recursive: true, force: true });
});

const diagnostics = async (name: string) => (await server.request<any[]>("semanticDiagnosticsSync", { file: file(name), includeLinePosition: true })).filter((d) => d.source === "gable");

describe("tsserver plugin", () => {
  describe("diagnostics", () => {
    it("reports analyzer diagnostics in the editor at template positions, with per-rule severity", async () => {
      const found = await diagnostics("app.ts");
      const text = disk("app.ts");
      const bare = found.find((d) => /call it: count\(\)/.test(d.message));
      expect(bare, JSON.stringify(found)).toBeDefined();
      expect(bare.category).toBe("warning");
      expect(bare.start).toBe(text.indexOf("{{ count }}") + 3);
      const unknown = found.find((d) => /cuont/.test(d.message));
      expect(unknown.category).toBe("error");
      expect(unknown.start).toBe(text.indexOf("cuont"));
      expect(found).toHaveLength(2);
    });

    it("leaves files without templates alone", async () => {
      expect(await diagnostics("plain.ts")).toEqual([]);
    });

    it("updates as the buffer is edited, before saving", async () => {
      expect(await diagnostics("typing.ts")).toEqual([]);
      const at = locate(disk("typing.ts"), "start");
      await server.request("change", { file: file("typing.ts"), line: at.line, offset: at.offset, endLine: at.line, endOffset: at.offset + 5, insertString: "{{ nope() }}" });
      const found = await diagnostics("typing.ts");
      expect(found.map((d) => d.message)).toEqual([expect.stringContaining("nope")]);
      await server.request("change", { file: file("typing.ts"), line: at.line, offset: at.offset, endLine: at.line, endOffset: at.offset + 12, insertString: "start" });
      expect(await diagnostics("typing.ts")).toEqual([]);
    });
  });

  describe("quick info", () => {
    it("shows the member's type and documentation for a name in a template expression", async () => {
      const at = locate(disk("app.ts"), "{{ title() }}", 3);
      const info = await server.request("quickinfo", { file: file("app.ts"), ...at });
      expect(info.displayString).toMatch(/title/);
      expect(info.displayString).toMatch(/WritableSignal/);
      expect(info.documentation).toMatch(/The page title\./);
      const text = disk("app.ts");
      expect(info.start).toEqual(locate(text, "title()", 0));
      expect(info.end).toEqual(locate(text, "title()", 5));
    });

    it("types a loop variable's members", async () => {
      const at = locate(disk("app.ts"), "item.label", 6);
      const info = await server.request("quickinfo", { file: file("app.ts"), ...at });
      expect(info.displayString).toMatch(/label: string/);
    });
  });

  describe("go to definition", () => {
    it("jumps from a template name to the class member", async () => {
      const text = disk("app.ts");
      const at = locate(text, "{{ title() }}", 3);
      const found = await server.request("definitionAndBoundSpan", { file: file("app.ts"), ...at });
      expect(found.definitions).toHaveLength(1);
      expect(found.definitions[0].file).toBe(file("app.ts"));
      expect(found.definitions[0].start).toEqual(locate(text, 'title = signal("Counter")'));
      expect(found.textSpan.start).toEqual(locate(text, "title()"));
    });
  });

  describe("completions", () => {
    /** Types `insert` in place of the template body of typing.ts and returns a request position at its end plus `back`. */
    async function typed(insert: string, back = 0) {
      const text = disk("typing.ts");
      const at = locate(text, "start");
      await server.request("change", { file: file("typing.ts"), line: at.line, offset: at.offset, endLine: at.line, endOffset: at.offset + 5, insertString: insert });
      return { file: file("typing.ts"), line: at.line, offset: at.offset + insert.length - back, restore: () => server.request("change", { file: file("typing.ts"), line: at.line, offset: at.offset, endLine: at.line, endOffset: at.offset + insert.length, insertString: "start" }) };
    }
    const names = async (position: object) => (await server.request("completionInfo", position)).entries.map((e: any) => e.name) as string[];

    it("offers class members inside an empty expression", async () => {
      const p = await typed("{{  }}", 3);
      expect(await names(p)).toEqual(expect.arrayContaining(["title", "items"]));
      await p.restore();
    });

    it("offers a member's members after a dot", async () => {
      const p = await typed("{{ items(). }}", 3);
      expect(await names(p)).toEqual(expect.arrayContaining(["length", "map"]));
      await p.restore();
    });

    it("completes a partially typed name", async () => {
      const p = await typed("{{ ti }}", 3);
      expect(await names(p)).toContain("title");
      await p.restore();
    });

    it("resolves entry details with documentation", async () => {
      const p = await typed("{{ ti }}", 3);
      await names(p);
      const [details] = await server.request<any[]>("completionEntryDetails", { ...p, entryNames: ["title"] });
      expect(details.documentation.map((d: any) => d.text).join("")).toMatch(/The page title\./);
      await p.restore();
    });

    it("offers block keywords after @", async () => {
      const p = await typed("@fo");
      expect(await names(p)).toEqual(expect.arrayContaining(["for", "if", "switch", "let", "defer"]));
      await p.restore();
    });

    it("leaves completions outside templates to TypeScript", async () => {
      const at = locate(disk("typing.ts"), "title = signal", 2);
      expect(await names({ file: file("typing.ts"), ...at })).toEqual(expect.not.arrayContaining(["items"]));
    });
  });

  describe("quick fixes", () => {
    const fixesAt = async (name: string, snippet: string, into: number, errorCodes: number[]) => {
      const at = locate(disk(name), snippet, into);
      return server.request<any[]>("getCodeFixes", { file: file(name), startLine: at.line, startOffset: at.offset, endLine: at.line, endOffset: at.offset, errorCodes });
    };
    const codeOf = async (name: string, pattern: RegExp) => (await server.request<any[]>("semanticDiagnosticsSync", { file: file(name) })).find((d) => pattern.test(d.text))!.code as number;

    it("calls a bare signal", async () => {
      const code = await codeOf("app.ts", /call it/);
      const fixes = await fixesAt("app.ts", "{{ count }}", 4, [code]);
      const fix = fixes.find((f) => f.fixName === "gable")!;
      expect(fix.description).toBe("Call the signal: count()");
      const text = disk("app.ts");
      const end = locate(text, "count }}", 5);
      expect(fix.changes[0].textChanges).toEqual([{ start: end, end, newText: "()" }]);
    });

    it("fixes a misspelled member from the did-you-mean suggestion", async () => {
      const code = await codeOf("app.ts", /cuont/);
      const fix = (await fixesAt("app.ts", "cuont()", 2, [code])).find((f) => f.fixName === "gable")!;
      expect(fix.description).toBe("Change spelling to 'count'");
      const text = disk("app.ts");
      expect(fix.changes[0].textChanges).toEqual([{ start: locate(text, "cuont"), end: locate(text, "cuont", 5), newText: "count" }]);
    });

    it("offers nothing where there is no diagnostic", async () => {
      const fixes = await fixesAt("app.ts", "{{ title() }}", 4, [90000, 90001, 90002, 90003, 90004, 90005, 90006, 90007]);
      expect(fixes.filter((f) => f.fixName === "gable")).toEqual([]);
    });
  });
});
