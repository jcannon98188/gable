// The shared words and the MCP tools of "why did this update" (TASK-56.19), over an in-memory MCP client with a fake Designer window.
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, describe, expect, it } from "vitest";
import type { WhyNode, WhyRun } from "@gable/core/devtools";
import type { ControlRequest, WhyResult } from "./control-protocol.js";
import { bindingTitle, causeText, dependencyRows, runText, summarizeWhy } from "./why.js";
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

const state = (name: string, v: string) => ({ id: "s-" + name, name, kind: "state" as const, owner: "Counter", value: { s: v } as never, depends: [], again: false, cut: false as never });
const run = (over: Partial<WhyRun>): WhyRun => ({ at: 1500, ms: 0.2, first: false, causes: [], more: 0, ...over }) as WhyRun;
const cause = { signal: { id: "s-count", name: "count", kind: "state", owner: "Counter" }, before: { s: "1" }, after: { s: "2" }, via: [{ id: "c-double", name: "double" }], by: "app" } as never;
const node = (over: Partial<WhyNode> = {}): WhyNode =>
  ({
    id: "e1", name: "effect", kind: "effect", owner: { id: "k1", name: "Counter" }, binding: { what: "class:big", node: "<p>" }, runs: 2,
    dependencies: [{ ...state("double", "4"), kind: "computed", depends: [state("count", "2")] }], dependents: [],
    recent: [run({ first: true }), run({ causes: [cause] })], ...over,
  }) as WhyNode;

class FakeWindow {
  received: ControlRequest[] = [];
  shown: WhyResult = { shown: { scope: "element", title: "<p>", component: { id: "k1", name: "Counter" }, nodes: [node()], elsewhere: 1 }, empty: "" };
  constructor(bridge: ShellBridge) {
    bridge.connect((r) => {
      this.received.push(r);
      queueMicrotask(() => {
        if (r.name === "why") bridge.reply({ id: r.id, ok: true, result: this.shown });
        else if (r.name === "highlightUpdates") bridge.reply({ id: r.id, ok: true, result: { on: (r.params as { on: boolean }).on, error: "" } });
        else bridge.reply({ id: r.id, ok: false, error: "unexpected " + r.name });
      });
    });
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

describe("why words", () => {
  it("writes a cause, with the computeds it went through and who wrote it", () => {
    expect(causeText(cause)).toBe("Counter.count 1 → 2 via double");
    expect(causeText({ ...(cause as object), by: "designer", via: [] } as never)).toBe("Counter.count 1 → 2 (written by the Designer)");
  });
  it("says why a run happened, or that nothing explains it", () => {
    expect(runText(run({ first: true }))).toMatch(/^Created/);
    expect(runText(run({}))).toMatch(/no recorded signal write explains it/);
    expect(runText(run({ causes: [cause], more: 2 }))).toBe("Caused by Counter.count 1 → 2 via double and 2 more.");
  });
  it("titles a binding", () => {
    expect(bindingTitle(node())).toBe('class "big" of <p>');
    expect(bindingTitle(node({ binding: { what: "text", node: "<li>" } }))).toBe("text of <li>");
    expect(bindingTitle(node({ binding: null as never }))).toBe("effect");
  });
  it("flattens the dependency tree depth first", () => {
    const rows = dependencyRows(node().dependencies);
    expect(rows.map((r) => [r.depth, r.name])).toEqual([[0, "double"], [1, "count"]]);
    expect(dependencyRows([{ ...state("a", "1"), again: true }])[0]!.note).toBe("shown above");
  });
  it("summarises a report for an agent", () => {
    const [s] = summarizeWhy({ nodes: [node()] });
    expect(s).toMatchObject({ id: "e1", what: 'class "big" of <p>', component: "Counter", runs: 2 });
    expect(s!.dependsOn.map((d) => d.name)).toEqual(["double", "count"]);
    expect(s!.recent[1]).toMatchObject({ first: false, causes: [{ name: "count", before: "1", after: "2", via: ["double"], by: "app" }], explanation: expect.stringContaining("Caused by") });
    expect(summarizeWhy({ nodes: [node()] }, 1)[0]!.recent).toHaveLength(1);
  });
});

describe("mcp: why tools", () => {
  it("lists the tools", async () => {
    const m = await setup();
    const names = (await m.client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["why_did_update", "highlight_updates"]));
  });

  it("explains the selection: what each binding depends on and why it last ran", async () => {
    const m = await setup();
    const r = jsonOf<any>(await m.call("why_did_update"));
    expect(r).toMatchObject({ scope: "element", title: "<p>", component: "Counter", elsewhere: 1 });
    expect(r.bindings[0].what).toBe('class "big" of <p>');
    expect(r.bindings[0].recent.at(-1).causes[0]).toMatchObject({ name: "count", via: ["double"] });
    expect(m.window.received[0]!.params).toEqual({ scope: "element" });
  });

  it("passes an id and the component scope to the shell", async () => {
    const m = await setup();
    await m.call("why_did_update", { scope: "component", id: "k1" });
    expect(m.window.received[0]!.params).toEqual({ scope: "component", id: "k1" });
  });

  it("says what is missing when there is nothing to explain", async () => {
    const m = await setup();
    m.window.shown = { shown: null, empty: "Select an element in Interact mode." };
    const r = await m.call("why_did_update");
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/Select an element/);
  });

  it("turns update highlighting on and off", async () => {
    const m = await setup();
    expect(jsonOf(await m.call("highlight_updates", { on: true }))).toEqual({ on: true });
    expect(jsonOf(await m.call("highlight_updates", { on: false }))).toEqual({ on: false });
  });
});
