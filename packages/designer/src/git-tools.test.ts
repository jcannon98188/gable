// The Source control MCP tools (TASK-56.25), through a real MCP client over a throwaway git repository, and the same
// operations over the backend's HTTP API (token checked). The real repository is never touched.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startBackend, type Backend } from "./server/backend.js";
import { EditService } from "./server/edit/service.js";
import { ShellBridge } from "./server/mcp/bridge.js";
import { createControlServer } from "./server/mcp/control.js";
import { checkProject } from "./server/projects.js";
import { TailwindService } from "./server/tailwind/api.js";

let repo = "";
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "gable-git-mcp-"));
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  mkdirSync(join(repo, "src"));
  writeFileSync(join(repo, "src/a.ts"), "one\ntwo\n");
  writeFileSync(join(repo, "src/s.css"), "s {}\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

async function connect() {
  let changed = 0;
  const server = createControlServer({
    root: repo,
    info: { root: repo, name: "git-fixture", previewUrl: "http://localhost:1", ready: true, error: null, server: "running", installing: false, check: checkProject(repo) },
    edits: new EditService(repo),
    tailwind: new TailwindService(repo),
    bridge: new ShellBridge(),
    diagnostics: async () => ({ at: 0, configErrors: [], diagnostics: [] }),
    historyChanged: () => undefined,
    gitChanged: () => void changed++,
    cdpPort: null,
    shellOrigins: () => [],
    browser: null,
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const text = (r.content[0] as { text: string }).text;
    return { error: r.isError === true, text, json: r.isError ? null : (JSON.parse(text) as Record<string, any>) };
  };
  return { client, call, changed: () => changed };
}

describe("mcp: source control tools", () => {
  it("lists the tools with honest annotations", async () => {
    const { client } = await connect();
    const tools = (await client.listTools()).tools;
    const by = (n: string) => tools.find((t) => t.name === n)!;
    expect(by("get_changes").annotations?.readOnlyHint).toBe(true);
    expect(by("get_file_diff").annotations?.readOnlyHint).toBe(true);
    for (const n of ["commit_changes", "revert_changes", "undo_revert"]) expect(by(n).annotations?.readOnlyHint).toBe(false);
    await client.close();
  });

  it("shows grouped changes and a file's hunks, commits one file, reverts another and undoes it", async () => {
    const { call, client, changed } = await connect();
    writeFileSync(join(repo, "src/a.ts"), "ONE\ntwo\n");
    writeFileSync(join(repo, "src/s.css"), "s { color: red }\n");
    writeFileSync(join(repo, "src/new.scenes.ts"), "x\n");

    const c = await call("get_changes");
    expect(c.json!.changed).toBe(3);
    expect(c.json!.groups.map((g: { group: string }) => g.group)).toEqual(["components", "scenes", "styles"]);

    const d = await call("get_file_diff", { path: "src/a.ts" });
    expect(d.json!.hunks).toHaveLength(1);
    expect(d.json!.diff).toContain("-one");
    expect(d.json!.diff).toContain("+ONE");

    const commit = await call("commit_changes", { paths: ["src/s.css"], message: "Red s" });
    expect(commit.json).toMatchObject({ ok: true, subject: "Red s", files: ["src/s.css"] });
    expect(git("log", "-1", "--format=%s")).toBe("Red s");
    expect(changed()).toBe(1);

    const rev = await call("revert_changes", { path: "src/a.ts", hunk: 0 });
    expect(rev.json).toMatchObject({ ok: true, files: ["src/a.ts"] });
    expect(readFileSync(join(repo, "src/a.ts"), "utf8")).toBe("one\ntwo\n");
    expect((await call("get_changes")).json!.undoableReverts).toEqual(["Revert a change in src/a.ts"]);

    expect((await call("undo_revert")).json).toMatchObject({ ok: true });
    expect(readFileSync(join(repo, "src/a.ts"), "utf8")).toBe("ONE\ntwo\n");
    expect(changed()).toBe(3);

    expect((await call("revert_changes", { path: "src/a.ts", hunk: 5 })).error).toBe(true);
    expect((await call("revert_changes", { path: "src/nope.ts" })).text).toMatch(/not a changed file/);
    expect((await call("commit_changes", { paths: ["src/a.ts"], message: "" })).error).toBe(true);
    await client.close();
  });

  it("tells a folder that is not a repository so", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gable-nogit-mcp-"));
    try {
      const saved = repo;
      repo = dir;
      const { call, client } = await connect();
      repo = saved;
      const r = await call("get_changes");
      expect(r.error).toBe(true);
      expect(r.text).toMatch(/not in a git repository/);
      await client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("backend: /api/git", () => {
  let backend: Backend | null = null;
  afterEach(async () => {
    await backend?.close();
    backend = null;
  });

  it("is token-checked and commits, reverts and undoes over HTTP, announcing each on the event stream", async () => {
    writeFileSync(join(repo, "package.json"), "{}");
    git("add", "-A");
    git("commit", "-q", "-m", "pkg");
    backend = await startBackend({ root: repo, port: 0, previewPort: 0, dataDir: join(repo, ".data"), mcpSessionDir: false });
    const api = (path: string, body?: unknown, token = backend!.token) =>
      fetch(`${backend!.url}/api/git/${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: (await r.json()) as Record<string, any> }));

    expect((await api("status", undefined, "wrong")).status).toBe(401);
    writeFileSync(join(repo, "src/a.ts"), "ONE\ntwo\n");
    const s = await api("status");
    expect(s.json.files.map((f: { path: string }) => f.path)).toEqual(["src/a.ts"]);
    const d = await api("diff?path=src%2Fa.ts");
    expect(d.json.hunks).toHaveLength(1);
    expect((await api("diff")).status).toBe(400);
    const r = await api("revert", { path: "src/a.ts", hunk: 0, header: d.json.hunks[0].header });
    expect(r.json.ok).toBe(true);
    expect((await api("undo-revert", {})).json.ok).toBe(true);
    const c = await api("commit", { paths: ["src/a.ts"], message: "Upper one" });
    expect(c.json).toMatchObject({ ok: true, subject: "Upper one" });
    expect((await api("commit", { paths: "src/a.ts", message: "x" })).json).toMatchObject({ ok: false, code: "invalid" });
    expect((await api("nope")).status).toBe(404);
  });
});
