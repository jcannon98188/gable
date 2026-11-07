// The MCP tools for signal state editing (TASK-56.17): set_signal, pin_signal, get_scene_state and save_scenario, over an
// in-memory MCP client with a fake Designer window answering the shell bridge, against a copy of the `mcp-app` fixture.
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, describe, expect, it } from "vitest";
import type { ControlRequest, SignalAction, SignalsResult } from "./control-protocol.js";
import type { SceneStateReport, SignalPin } from "./protocol.js";
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

/** The window, as far as these tools see it: a mounted ProfileCard whose `followed` signal and `name` input can be poked. */
class FakeWindow {
  received: ControlRequest[] = [];
  pins: SignalPin[] = [];
  values: Record<string, string> = { followed: "false", name: '"Ada"' };
  poked = new Set<string>();
  scenes = ["Default", "Followed"];
  constructor(bridge: ShellBridge, private root: string) {
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
  scene(): SceneStateReport {
    return {
      module: "/src/card.scenes.ts",
      component: "ProfileCard",
      scene: "Default",
      fields: [
        { field: "name", kind: "input", id: "s2", text: this.values.name!, poked: this.poked.has("name"), changed: this.poked.has("name") },
        { field: "followed", kind: "state", id: "s1", text: this.values.followed!, poked: this.poked.has("followed"), changed: this.poked.has("followed") },
      ],
      skipped: [],
    };
  }
  handle(r: ControlRequest): unknown {
    const p = r.params as Record<string, unknown>;
    switch (r.name) {
      case "inspect":
        if (p.what === "component") return { id: "c1", name: "ProfileCard", source: null, inputs: [{ id: "s2", name: "name", kind: "state", writable: true }], signals: [{ id: "s1", name: "followed", kind: "state", writable: true }], outputs: [], effects: [] };
        if (p.what === "scenes") {
          // The hot update lands: the file now lists what was written.
          const text = readFileSync(join(this.root, "src/card.scenes.ts"), "utf8");
          return { module: "/src/card.scenes.ts", component: "ProfileCard", current: "Default", scenes: [...text.matchAll(/^ {4}(\w+): /gm)].map((m) => ({ name: m[1] })) };
        }
        throw new Error("not faked");
      case "signals": {
        const a = p as SignalAction;
        const field = a.action === "report" ? null : a.id === "s1" ? "followed" : "name";
        const out: SignalsResult = { pins: this.pins, scene: this.scene() };
        if (a.action === "set") {
          if (field === "followed" && !/^(true|false)$/.test(a.text) && !a.force) return { ...out, write: { ok: false, error: "The value does not have the shape of the current one.", problems: ["value was a boolean, not a number."] } };
          this.values[field!] = a.text;
          this.poked.add(field!);
          return { ...out, write: { ok: true }, scene: this.scene() };
        }
        if (a.action === "pin") {
          this.pins = a.text === null ? [] : [{ id: a.id, name: field!, owner: "ProfileCard", text: a.text, status: "active" }];
          return { write: { ok: true }, pins: this.pins, scene: this.scene() };
        }
        return out;
      }
      case "setScene":
        return { scene: p.name };
      default:
        throw new Error(`unexpected command ${r.name}`);
    }
  }
}

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "gable-signal-tools-"));
  made.push(root);
  cpSync(FIXTURE, root, { recursive: true, filter: (src) => !src.includes("node_modules") });
  const bridge = new ShellBridge();
  bridge.shellUrl = "http://127.0.0.1:9/";
  const window = new FakeWindow(bridge, root);
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
  return { root, client, window, call, scenes: () => readFileSync(join(root, "src/card.scenes.ts"), "utf8") };
}

describe("mcp: signal state tools", () => {
  it("lists the tools", async () => {
    const m = await setup();
    const names = (await m.client.listTools()).tools.map((t) => t.name);
    for (const name of ["set_signal", "pin_signal", "get_scene_state", "save_scenario"]) expect(names).toContain(name);
  });

  it("sets a signal by field name, with the shape check and force", async () => {
    const m = await setup();
    const refused = await m.call("set_signal", { name: "followed", value: "3" });
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toMatch(/was a boolean, not a number[\s\S]*force: true/);
    expect(jsonOf(await m.call("set_signal", { name: "followed", value: "true" }))).toMatchObject({ ok: true });
    expect(jsonOf(await m.call("set_signal", { id: "s1", value: "3", force: true }))).toMatchObject({ ok: true });
    expect(m.window.received.filter((r) => r.name === "signals").map((r) => r.params)).toContainEqual({ action: "set", id: "s1", text: "true", force: false });
    expect(textOf(await m.call("set_signal", { name: "nope", value: "1" }))).toMatch(/no signal or input named "nope". It has: name, followed/);
  });

  it("pins and unpins", async () => {
    const m = await setup();
    expect(jsonOf<{ pins: SignalPin[] }>(await m.call("pin_signal", { name: "followed", value: "true" })).pins).toEqual([{ id: "s1", name: "followed", owner: "ProfileCard", text: "true", status: "active" }]);
    expect(jsonOf<{ pins: SignalPin[] }>(await m.call("pin_signal", { name: "followed", value: null })).pins).toEqual([]);
  });

  it("saves the poked state as a new scene, as one undoable edit with its diff, and shows it", async () => {
    const m = await setup();
    await m.call("set_signal", { name: "followed", value: "true" });
    await m.call("set_signal", { name: "name", value: '"Grace"' });
    expect(jsonOf<{ wouldSave: string[] }>(await m.call("get_scene_state")).wouldSave).toEqual(["name", "followed"]);
    const before = m.scenes();
    const saved = jsonOf<{ diff: string; label: string; shown: boolean }>(await m.call("save_scenario", { name: "Grace", description: "Followed Grace" }));
    expect(saved.label).toBe('Add Scenario "Grace"');
    expect(saved.diff).toContain(`+    Grace: { description: "Followed Grace", inputs: { name: "Grace" }, state: { followed: true } },`);
    expect(saved.shown).toBe(true);
    expect(m.window.received.at(-1)).toMatchObject({ name: "setScene", params: { name: "Grace" } });
    expect(textOf(await m.call("save_scenario", { name: "Grace" }))).toMatch(/already a Scenario called "Grace"/);
    expect(textOf(await m.call("save_scenario", { name: "Other", fields: [] }))).toMatch(/Choose at least one/);
    jsonOf(await m.call("undo"));
    expect(m.scenes()).toBe(before);
  });
});
