// The MCP tools for signal time travel (TASK-56.18): get_signal_history, travel_signal_history, clear_signal_history and
// record_signal_history, over an in-memory MCP client with a fake Designer window answering the shell bridge's `history`.
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, describe, expect, it } from "vitest";
import type { HistoryInfo, HistoryStep } from "@gable/core/devtools";
import type { ControlRequest, HistoryAction, HistoryResult } from "./control-protocol.js";
import { EditService } from "./server/edit/service.js";
import { ShellBridge } from "./server/mcp/bridge.js";
import { createControlServer } from "./server/mcp/control.js";
import { TailwindService } from "./server/tailwind/api.js";
import { checkProject } from "./server/projects.js";

const FIXTURE = fileURLToPath(new URL("../test-fixtures/mcp-app", import.meta.url));
const made: string[] = [];
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

const textOf = (r: CallToolResult) => (r.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
const jsonOf = <T = Record<string, unknown>>(r: CallToolResult): T => {
  if (r.isError) throw new Error(`tool error: ${textOf(r)}`);
  return JSON.parse(textOf(r)) as T;
};

const step = (seq: number, count: number, source: "app" | "designer" = "app"): HistoryStep => ({
  seq,
  at: seq * 100,
  source,
  writes: [{ id: "s1", name: "count", owner: "Counter", before: { s: String(count - 1) } as never, after: { s: String(count) } as never }],
  more: 0,
});

/** The window, as far as these tools see it: a State timeline holding three steps of a counter. */
class FakeWindow {
  received: ControlRequest[] = [];
  info: HistoryInfo = { recording: true, steps: [step(4, 1), step(5, 2), step(6, 3, "designer")], cursor: null, dropped: 3, maxSteps: 300, maxWrites: 2000 };
  gone = 0;
  constructor(bridge: ShellBridge) {
    bridge.connect((r) => {
      this.received.push(r);
      queueMicrotask(() => {
        try {
          bridge.reply({ id: r.id, ok: true, result: this.handle(r) });
        } catch (e) {
          bridge.reply({ id: r.id, ok: false, error: (e as Error).message });
        }
      });
    });
  }
  handle(r: ControlRequest): HistoryResult {
    if (r.name !== "history") throw new Error(`unexpected command ${r.name}`);
    const a = r.params as HistoryAction;
    if (a.action === "clear") this.info = { ...this.info, steps: [], cursor: null, dropped: 0 };
    if (a.action === "record") this.info = { ...this.info, recording: a.on };
    if (a.action === "travel") {
      const seqs = this.info.steps.map((s) => s.seq);
      const to = a.to === "live" ? seqs.at(-1)! : a.to === "start" ? seqs[0]! - 1 : a.to;
      if (to < seqs[0]! - 1 || to > seqs.at(-1)!) return { info: this.info, travel: { ok: false, error: `No step ${to}: the history holds steps ${seqs[0]} to ${seqs.at(-1)} (${seqs[0]! - 1} is the state before them).` } };
      this.info = { ...this.info, cursor: to === seqs.at(-1) ? null : to };
      return { info: this.info, travel: { ok: true, seq: to, applied: 1, gone: this.gone, incomplete: false } };
    }
    return { info: this.info };
  }
}

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "gable-history-tools-"));
  made.push(root);
  cpSync(FIXTURE, root, { recursive: true, filter: (src) => !src.includes("node_modules") });
  const bridge = new ShellBridge();
  bridge.shellUrl = "http://127.0.0.1:9/";
  const window = new FakeWindow(bridge);
  const server = createControlServer({
    root,
    info: { root, name: "fixture", previewUrl: "http://localhost:1", ready: true, error: null, server: "running", installing: false, check: checkProject(root) },
    edits: new EditService(root),
    tailwind: new TailwindService(root),
    bridge,
    diagnostics: async () => ({ at: 0, configErrors: [], diagnostics: [] }),
    historyChanged: () => undefined,
    cdpPort: null,
    shellOrigins: () => [],
    browser: null,
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
  return { client, window, call };
}

describe("mcp: signal history tools", () => {
  it("lists the tools", async () => {
    const m = await setup();
    const names = (await m.client.listTools()).tools.map((t) => t.name);
    for (const name of ["get_signal_history", "travel_signal_history", "clear_signal_history", "record_signal_history"]) expect(names).toContain(name);
  });

  it("reads the newest steps with each write's before and after, and where the frame is", async () => {
    const m = await setup();
    const h = jsonOf(await m.call("get_signal_history", { limit: 2 }));
    expect(h).toEqual({
      recording: true,
      shown: "live",
      steps: [
        { step: 5, atMs: 500, source: "app", writes: [{ signal: "s1", name: "count", owner: "Counter", before: "1", after: "2" }] },
        { step: 6, atMs: 600, source: "designer", writes: [{ signal: "s1", name: "count", owner: "Counter", before: "2", after: "3" }] },
      ],
      total: 3,
      omitted: 1,
      dropped: 3,
      bounds: { steps: 300, writes: 2000 },
    });
  });

  it("travels to a step, to the start and back live, and refuses a step it does not hold", async () => {
    const m = await setup();
    expect(jsonOf(await m.call("travel_signal_history", { to: 5 }))).toEqual({ ok: true, shown: 5, applied: 1, gone: 0 });
    expect(jsonOf(await m.call("travel_signal_history", { to: "start" }))).toMatchObject({ shown: "start" });
    expect(jsonOf(await m.call("get_signal_history")).shown).toBe("start");
    expect(jsonOf(await m.call("travel_signal_history", { to: "live" }))).toMatchObject({ shown: "live" });
    const refused = await m.call("travel_signal_history", { to: 1 });
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toMatch(/No step 1: the history holds steps 4 to 6 \(3 is the state before them\)/);
    expect(m.window.received.map((r) => r.params)).toContainEqual({ action: "travel", to: "start" });
  });

  it("says which signals a travel left out", async () => {
    const m = await setup();
    m.window.gone = 2;
    expect(jsonOf<{ notes: string[] }>(await m.call("travel_signal_history", { to: 4 })).notes).toEqual([expect.stringMatching(/^2 signal\(s\) of that state no longer exist/)]);
  });

  it("pauses, resumes and clears", async () => {
    const m = await setup();
    expect(jsonOf(await m.call("record_signal_history", { on: false }))).toEqual({ recording: false, total: 3 });
    expect(jsonOf(await m.call("record_signal_history", { on: true }))).toEqual({ recording: true, total: 3 });
    expect(jsonOf(await m.call("clear_signal_history"))).toMatchObject({ steps: [], total: 0, shown: "live" });
  });
});
