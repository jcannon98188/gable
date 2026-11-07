// The MCP control plane (TASK-56.13) against the `mcp-app` fixture: the tools over an in-memory MCP client, with a fake
// Designer window answering the shell bridge, and the HTTP endpoint's auth on a real backend.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { DesignNode } from "@gable/core/designer";
import { afterAll, describe, expect, it } from "vitest";
import type { ControlRequest, SelectionSnapshot, ShellSnapshot } from "./control-protocol.js";
import { startBackend } from "./server/backend.js";
import { CompileChecks } from "./server/compile-check.js";
import { EditService } from "./server/edit/service.js";
import { ShellBridge } from "./server/mcp/bridge.js";
import { createControlServer } from "./server/mcp/control.js";
import { readSession, removeSession, writeSession } from "./server/mcp/session-file.js";
import { positionOf, projectFile, targetAt, unifiedDiff } from "./server/mcp/targets.js";
import { TailwindService } from "./server/tailwind/api.js";
import { checkProject } from "./server/projects.js";

const FIXTURE = fileURLToPath(new URL("../test-fixtures/mcp-app", import.meta.url));
// Copies live under the repo's node_modules (ignored by git) so the fixture's `@import "tailwindcss"` resolves.
const SCRATCH = fileURLToPath(new URL("../../../node_modules/.cache/gable-mcp-test", import.meta.url));
const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function copyFixture(base = SCRATCH): string {
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, "app-"));
  cpSync(FIXTURE, root, { recursive: true });
  made.push(root);
  return root;
}

const CARD = "src/card.ts";
/** 1-based line of the first line of `card.ts` that contains `needle`. */
const lineOf = (root: string, needle: string) => readFileSync(join(root, CARD), "utf8").split(/\r?\n/).findIndex((l) => l.includes(needle)) + 1;
/** The position of the first occurrence of `needle` in card.ts (inside it: one column in). */
const at = (root: string, needle: string) => {
  const lines = readFileSync(join(root, CARD), "utf8").split(/\r?\n/);
  const line = lines.findIndex((l) => l.includes(needle));
  return { file: CARD, line: line + 1, column: lines[line]!.indexOf(needle) + 2 };
};
const textOf = (r: CallToolResult) => (r.content as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text).join("\n");
const jsonOf = <T = Record<string, unknown>>(r: CallToolResult): T => {
  if (r.isError) throw new Error(`tool error: ${textOf(r)}`);
  return JSON.parse(textOf(r)) as T;
};

// --- a fake Designer window -------------------------------------------------------------------------------------------

/** Answers the bridge as the shell would, with just enough state for the tools; records every command. */
class FakeShell {
  received: ControlRequest[] = [];
  selection: SelectionSnapshot | null = null;
  mode: "select" | "interact" = "select";
  disconnect: () => void;
  constructor(
    private bridge: ShellBridge,
    private root: string,
  ) {
    this.disconnect = bridge.connect((r) => {
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
  snapshot(): ShellSnapshot {
    const emulation = { touch: false, colorScheme: "auto" as const, reducedMotion: false, userAgent: null };
    return {
      connection: "ready",
      mode: this.mode,
      target: { kind: "component", scenes: "/src/card.scenes.ts" },
      scene: "Default",
      pageScenario: null,
      url: null,
      frames: [{ id: "f1", name: "Desktop", width: 1280, height: 800, dpr: 1, landscape: false, presetId: "desktop", emulation, connection: "ready", selected: true, nonce: "n1" }],
      selectedFrame: "f1",
      breakpoint: "xl",
      selection: this.selection,
      presets: [{ id: "desktop", name: "Desktop", width: 1280, height: 800 }],
    };
  }
  handle(r: ControlRequest): unknown {
    const p = r.params as Record<string, unknown> | null;
    switch (r.name) {
      case "snapshot":
        return this.snapshot();
      case "setMode":
        this.mode = p!.mode as "select" | "interact";
        return this.snapshot();
      case "select": {
        if (p === null) return (this.selection = null);
        if ("selector" in p!) throw new Error("selectors are not faked");
        const raw = p!.raw as string;
        const start = p!.offset as number;
        const tag = /^<([\w-]+)/.exec(raw.slice(start))![1]!;
        const node: DesignNode = { id: "t1:" + start, tag, raw, exact: true, start, openEnd: raw.indexOf(">", start) + 1, end: raw.length, elements: 1, component: { id: "c1", name: "ProfileCard", source: { path: "/src/card.ts" } as never } };
        return (this.selection = { node, chain: [{ id: node.id, tag }], component: { id: "c1", name: "ProfileCard" }, source: null });
      }
      case "reselect":
        return true;
      case "inspect":
        if (p!.what === "tree")
          return [
            { id: "c0", parent: null, name: "Host", selector: "app-host", label: "" },
            { id: "c1", parent: "c0", name: "ProfileCard", selector: "app-profile-card", label: "Ada" },
          ];
        if (p!.what === "component") return { id: "c1", name: "ProfileCard", source: null, inputs: [], signals: [{ id: "s1", name: "followed", kind: "signal", writable: true, value: { t: "boolean", s: "false" } }], outputs: [], effects: [] };
        return [];
      case "performance":
        return {
          report: p!.reload ? { url: "/", mode: "page", metrics: [{ id: "lcp", label: "Largest Contentful Paint", value: 1200, unit: "ms", rating: "good", thresholds: [2500, 4000], unavailable: null, element: { label: "img#hero", node: { id: "t1:4", tag: "img", component: "Hero" }, connected: true } }] } : null,
          error: p!.reload ? null : "The page could not be measured.",
          after: p!.reload ? "Re-run" : "",
          frame: { name: "Desktop", width: 1280, height: 800, dpr: 1, throttling: "none" },
          note: "dev server",
        };
      case "frameRect":
        return { frame: "f1", nonce: "n1", rect: { x: 0, y: 0, width: 640, height: 400 }, width: 1280, height: 800, scale: 0.5, url: "http://localhost:1/", dpr: 1, emulation: this.snapshot().frames[0]!.emulation };
      default:
        throw new Error(`unexpected command ${r.name} (${JSON.stringify(p)}) for root ${this.root}`);
    }
  }
}

async function connect(root: string) {
  const bridge = new ShellBridge();
  bridge.shellUrl = "http://127.0.0.1:9/";
  const edits = new EditService(root);
  const compile = new CompileChecks(root);
  let historyEvents = 0;
  const server = createControlServer({
    root,
    info: { root, name: "mcp-fixture", previewUrl: "http://localhost:1", ready: true, error: null, server: "running", installing: false, check: checkProject(root) },
    edits,
    tailwind: new TailwindService(root),
    bridge,
    diagnostics: async () => ({ at: 0, configErrors: [], diagnostics: [{ id: "d1", file: CARD, line: 3, column: 1, severity: "warn", rule: "demo", message: "a demo problem", raw: "x", offset: 0 }] }),
    historyChanged: () => void historyEvents++,
    compileErrors: () => compile.list(),
    cdpPort: null,
    shellOrigins: () => [],
    browser: null,
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
  return { client, call, bridge, edits, compile, historyEvents: () => historyEvents, close: () => client.close() };
}

// --- positions and diffs ----------------------------------------------------------------------------------------------

describe("mcp: source positions", () => {
  it("finds the innermost element at a position and maps back to it", () => {
    const root = copyFixture(mkdtempSync(join(tmpdir(), "gable-mcp-pos-")));
    const line = lineOf(root, "<h2");
    const inText = targetAt(root, { file: CARD, line, column: readFileSync(join(root, CARD), "utf8").split(/\r?\n/)[line - 1]!.indexOf("Ada") + 1 });
    if ("error" in inText) throw new Error(inText.error);
    expect(inText.target.tag).toBe("h2");
    expect(inText.at).toEqual({ file: CARD, line, column: 9 });
    expect(positionOf(root, CARD, inText.target.raw, inText.target.start)).toEqual(inText.at);
    // between elements of the section: the section
    const section = targetAt(root, { file: CARD, line: lineOf(root, "<p>"), column: 1 });
    expect("error" in section ? section.error : section.target.tag).toBe("section");
    // dev-server URLs work too
    expect(projectFile(root, "/src/card.ts")).toMatchObject({ rel: CARD });
  });

  it("refuses positions outside templates and files outside the project", () => {
    const root = copyFixture(mkdtempSync(join(tmpdir(), "gable-mcp-pos-")));
    expect(targetAt(root, { file: CARD, line: 1, column: 1 })).toMatchObject({ error: expect.stringContaining("not inside an html") });
    expect(targetAt(root, { file: CARD, line: 999, column: 1 })).toMatchObject({ error: expect.stringContaining("out of range") });
    expect(projectFile(root, "../outside.ts")).toMatchObject({ error: expect.stringContaining("not a file of the project") });
    expect(projectFile(root, "node_modules/x/index.ts")).toMatchObject({ error: expect.stringContaining("not a file of the project") });
  });

  it("writes a unified diff of only the changed lines", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g"].join("\n");
    const after = ["a", "b", "c", "D", "e", "f", "g"].join("\n");
    expect(unifiedDiff("x.ts", before, after)).toBe(["--- a/x.ts", "+++ b/x.ts", "@@ -2,5 +2,5 @@", " b", " c", "-d", "+D", " e", " f"].join("\n"));
    expect(unifiedDiff("x.ts", before, before)).toBe("");
    expect(unifiedDiff("x.ts", "a\r\nb\r\n", "a\r\nB\r\n")).toContain("+B");
  });
});

// --- tools --------------------------------------------------------------------------------------------------------------

describe("mcp: tools against the fixture", () => {
  it("lists typed tools with descriptions", async () => {
    const m = await connect(copyFixture());
    try {
      const { tools } = await m.client.listTools();
      const names = tools.map((t) => t.name);
      for (const n of ["get_status", "list_components", "list_scenes", "list_routes", "get_selection", "get_tree", "get_signals", "get_problems", "get_hmr_timeline", "get_performance", "set_mode", "show_component", "set_scenario", "navigate", "add_frame", "update_frame", "select_element", "edit_text", "set_attribute", "insert_element", "edit_classes", "undo", "redo", "screenshot"]) expect(names).toContain(n);
      for (const t of tools) {
        expect(t.description!.length).toBeGreaterThan(20);
        expect(t.inputSchema.type).toBe("object");
      }
      const edit = tools.find((t) => t.name === "edit_text")!;
      expect(Object.keys(edit.inputSchema.properties!)).toEqual(expect.arrayContaining(["target", "text", "run"]));
      expect(tools.find((t) => t.name === "get_status")!.annotations?.readOnlyHint).toBe(true);
    } finally {
      await m.close();
    }
  });

  it("reads project state without a window, and says where to open one", async () => {
    const m = await connect(copyFixture());
    try {
      const status = jsonOf<{ window: { connected: boolean; open: string }; tailwind: { enabled: boolean }; screenshot: string }>(await m.call("get_status"));
      expect(status.window).toEqual({ connected: false, open: "http://127.0.0.1:9/" });
      expect(status.tailwind.enabled).toBe(true);
      expect(status.screenshot).toContain("unavailable");

      const comps = jsonOf<{ components: Array<{ name: string }> }>(await m.call("list_components"));
      expect(comps.components.map((c) => c.name).sort()).toEqual(["AboutPage", "ProfileCard"]);
      const scenes = jsonOf<Array<{ file: string; scenes: Array<{ name: string }> }>>(await m.call("list_scenes"));
      expect(scenes[0]!.file).toBe("/src/card.scenes.ts");
      expect(scenes[0]!.scenes.map((s) => s.name)).toEqual(["Default", "Followed"]);
      const routes = jsonOf<{ config: { file: string; routes: Array<{ path: string }> }; runtime: unknown[] }>(await m.call("list_routes"));
      expect(routes.config.file).toBe("src/routes.ts");
      expect(routes.config.routes.map((r) => r.path)).toEqual(["", "about"]);
      expect(routes.runtime).toEqual([]);
      const problems = jsonOf<{ problems: Array<Record<string, unknown>>; notCompiling: unknown[] }>(await m.call("get_problems"));
      expect(problems.problems).toEqual([{ file: CARD, line: 3, column: 1, severity: "warn", rule: "demo", message: "a demo problem" }]);
      expect(problems.notCompiling).toEqual([]);

      // a template that does not compile is listed at once, ahead of the full analysis
      const root = m.edits.root;
      writeFileSync(join(root, CARD), readFileSync(join(root, CARD), "utf8").replace("<p>Analyst</p>", '<p class="x {{ followed() }}">Analyst</p>'));
      expect(m.compile.update([CARD])).toBe(true);
      const broken = jsonOf<{ notCompiling: unknown[] }>(await m.call("get_problems"));
      expect(broken.notCompiling).toEqual([{ file: CARD, line: lineOf(root, "Analyst"), column: 19, rule: "template-syntax", message: 'Interpolation in attribute "class" is not supported; use [attr.class] or [class.name].' }]);

      // UI reads need the window; the error says how to get one
      const tree = await m.call("get_tree");
      expect(tree.isError).toBe(true);
      expect(textOf(tree)).toContain("Open http://127.0.0.1:9/");
    } finally {
      await m.close();
    }
  });

  it("describes an element by source position, with its neighbours' positions", async () => {
    const root = copyFixture();
    const m = await connect(root);
    try {
      const d = jsonOf<{ tag: string; attrs: Array<{ name: string; value: string }>; parent: { tag: string }; next: { tag: string; at: { line: number } } }>(await m.call("describe_element", { target: { file: CARD, line: lineOf(root, "<h2"), column: 10 } }));
      expect(d.tag).toBe("h2");
      expect(d.attrs).toEqual([expect.objectContaining({ name: "class", value: "font-bold" })]);
      expect(d.parent.tag).toBe("section");
      expect(d.next).toMatchObject({ tag: "p", at: { line: lineOf(root, "<p>") } });
      const bad = await m.call("describe_element", { target: { file: CARD, line: 1 } });
      expect(bad.isError).toBe(true);
    } finally {
      await m.close();
    }
  });

  it("edits through the edit service, answers with the patch, and undoes and redoes", async () => {
    const root = copyFixture();
    const m = await connect(root);
    const file = join(root, CARD);
    const original = readFileSync(file, "utf8");
    try {
      const h2 = { file: CARD, line: lineOf(root, "<h2"), column: 10 };
      const r = jsonOf<{ ok: boolean; file: string; diff: string; element: { line: number } }>(await m.call("edit_text", { target: h2, text: "Grace Hopper" }));
      expect(r.ok).toBe(true);
      expect(r.file).toBe(CARD);
      expect(r.diff).toContain('-        <h2 class="font-bold">Ada Lovelace</h2>');
      expect(r.diff).toContain('+        <h2 class="font-bold">Grace Hopper</h2>');
      expect(r.element.line).toBe(h2.line);
      expect(readFileSync(file, "utf8")).toBe(original.replace("Ada Lovelace", "Grace Hopper"));
      expect(m.historyEvents()).toBe(1);

      const attr = jsonOf<{ diff: string }>(await m.call("set_attribute", { target: h2, name: "title", value: "Name" }));
      expect(attr.diff).toContain('title="Name"');
      const history = jsonOf<{ undo: Array<{ label: string }> }>(await m.call("get_history"));
      expect(history.undo).toHaveLength(2);

      jsonOf(await m.call("undo"));
      const undone = jsonOf<{ diff: string }>(await m.call("undo"));
      expect(undone.diff).toContain("-        <h2 class=\"font-bold\">Grace Hopper</h2>");
      expect(readFileSync(file, "utf8")).toBe(original);
      jsonOf(await m.call("redo"));
      expect(readFileSync(file, "utf8")).toContain("Grace Hopper");
      expect(m.historyEvents()).toBe(5);
    } finally {
      await m.close();
    }
  });

  it("finds uses, renames a component across files as one undo step, and extracts a component", async () => {
    const root = copyFixture();
    const m = await connect(root);
    const scenes = join(root, "src/card.scenes.ts");
    try {
      const names = (await m.client.listTools()).tools.map((t) => t.name);
      for (const n of ["find_uses", "rename_component", "extract_component"]) expect(names).toContain(n);
      expect((await m.client.listTools()).tools.find((t) => t.name === "find_uses")!.annotations?.readOnlyHint).toBe(true);

      const uses = jsonOf<{ count: number; declaration: { file: string; selector: string }; uses: Array<{ kind: string; file: string; line: number }> }>(await m.call("find_uses", { kind: "component", name: "ProfileCard" }));
      expect(uses.declaration).toMatchObject({ file: CARD, selector: "app-profile-card" });
      expect(uses.uses.map((u) => u.kind + "@" + u.file)).toEqual(expect.arrayContaining(["declaration@src/card.ts", "import@src/card.scenes.ts", "reference@src/card.scenes.ts"]));
      const classes = jsonOf<{ uses: Array<{ kind: string }> }>(await m.call("find_uses", { kind: "class", name: "font-bold" }));
      expect(classes.uses.map((u) => u.kind)).toEqual(["class-attr"]);
      expect((await m.call("find_uses", { kind: "component", name: "Nope" })).isError).toBe(true);

      const before = { card: readFileSync(join(root, CARD), "utf8"), scenes: readFileSync(scenes, "utf8") };
      const r = jsonOf<{ ok: boolean; changed: string[]; note: string; label: string }>(await m.call("rename_component", { from: "ProfileCard", to: "ProfileBadge", selector: "app-profile-badge" }));
      expect(r.changed).toEqual([CARD, "src/card.scenes.ts"]);
      expect(r.label).toContain("Rename ProfileCard to ProfileBadge");
      expect(readFileSync(join(root, CARD), "utf8")).toContain("export class ProfileBadge {");
      expect(readFileSync(join(root, CARD), "utf8")).toContain('selector: "app-profile-badge"');
      expect(readFileSync(scenes, "utf8")).toContain("component: ProfileBadge,");
      expect(jsonOf<{ undo: unknown[] }>(await m.call("get_history")).undo).toHaveLength(1);
      expect((await m.call("rename_component", { from: "ProfileBadge", to: "AboutPage" })).isError).toBe(true);
      jsonOf(await m.call("undo"));
      expect(readFileSync(join(root, CARD), "utf8")).toBe(before.card);
      expect(readFileSync(scenes, "utf8")).toBe(before.scenes);

      // extract: static markup moves; a handler is refused with the reason
      const ex = jsonOf<{ created: string[]; diff: string }>(await m.call("extract_component", { target: at(root, "<p>Analyst"), name: "Role" }));
      expect(ex.created).toEqual(["src/role.ts"]);
      expect(readFileSync(join(root, "src/role.ts"), "utf8")).toContain("<p>Analyst</p>");
      const refused = await m.call("extract_component", { target: at(root, "<button"), name: "FollowAction", props: true });
      expect(refused.isError).toBe(true);
      expect(textOf(refused)).toMatch(/event handler/);
    } finally {
      await m.close();
    }
  });

  it("inserts, wraps, moves and deletes elements", async () => {
    const root = copyFixture();
    const m = await connect(root);
    const file = join(root, CARD);
    try {
      const p = () => at(root, "<p>Analyst");
      const ins = jsonOf<{ diff: string }>(await m.call("insert_element", { target: p(), where: "after", snippet: "<small>since 1843</small>" }));
      expect(ins.diff).toMatch(/\+\s+<small>since 1843<\/small>/);
      const pal = await m.call("insert_element", { target: p(), where: "before", paletteItem: "no-such-thing" });
      expect(pal.isError).toBe(true);

      jsonOf(await m.call("wrap_element", { target: p(), if: "followed()" }));
      expect(readFileSync(file, "utf8")).toMatch(/@if \(followed\(\)\) \{\s*<p>Analyst<\/p>\s*\}/);

      const button = at(root, "<button");
      const h2 = at(root, "<h2");
      jsonOf(await m.call("move_element", { target: button, to: h2, where: "before" }));
      const text = readFileSync(file, "utf8");
      expect(text.indexOf("<button")).toBeLessThan(text.indexOf("<h2"));

      jsonOf(await m.call("delete_element", { target: at(root, "<small>") }));
      expect(readFileSync(file, "utf8")).not.toContain("<small>");
    } finally {
      await m.close();
    }
  });

  it("edits Tailwind classes at a breakpoint and state, and reads them back", async () => {
    const root = copyFixture();
    const m = await connect(root);
    try {
      const section = { file: CARD, line: lineOf(root, "<section"), column: 10 };
      const r = jsonOf<{ classes: string; added: string[]; removed: string[]; diff: string }>(await m.call("edit_classes", { target: section, add: ["p-8", "bg-brand"] }));
      expect(r.classes.split(" ")).toEqual(expect.arrayContaining(["card", "p-8", "text-sm", "bg-brand"]));
      expect(r.removed).toEqual(["p-4"]);
      expect(r.diff).toContain("-      <section");
      const md = jsonOf<{ classes: string }>(await m.call("edit_classes", { target: section, add: ["p-2"], breakpoint: "md", states: ["hover"] }));
      expect(md.classes.split(" ")).toEqual(expect.arrayContaining(["p-8", "md:hover:p-2"]));
      const removed = jsonOf<{ classes: string }>(await m.call("edit_classes", { target: section, remove: ["bg-brand"] }));
      expect(removed.classes).not.toContain("bg-brand");
      const unknown = await m.call("edit_classes", { target: section, add: ["not-a-utility-xyz"] });
      expect(unknown.isError).toBe(true);

      const styles = jsonOf<{ classes: string; values: Record<string, { token?: string }> }>(await m.call("get_styles", { target: section }));
      expect(styles.classes).toContain("p-8");
      expect(Object.keys(styles.values).length).toBeGreaterThan(0);
    } finally {
      await m.close();
    }
  });

  it("sets a CSS declaration with undo", async () => {
    const root = copyFixture();
    const m = await connect(root);
    try {
      const r = jsonOf<{ diff: string }>(await m.call("set_css", { file: "src/styles.css", selector: ".card", property: "border-radius", value: "12px" }));
      expect(r.diff).toContain("+  border-radius: 12px;");
      expect(readFileSync(join(root, "src/styles.css"), "utf8")).toContain("border-radius: 12px");
      jsonOf(await m.call("undo"));
      expect(readFileSync(join(root, "src/styles.css"), "utf8")).toContain("border-radius: 8px");
      expect((await m.call("set_css", { file: "../x.css", selector: "a", property: "color", value: "red" })).isError).toBe(true);
    } finally {
      await m.close();
    }
  });

  it("drives UI state through the window, and edits the element selected there", async () => {
    const root = copyFixture();
    const m = await connect(root);
    const shell = new FakeShell(m.bridge, root);
    try {
      const mode = jsonOf<{ mode: string }>(await m.call("set_mode", { mode: "interact" }));
      expect(mode.mode).toBe("interact");
      expect(shell.received.at(-1)).toMatchObject({ name: "setMode", params: { mode: "interact" } });

      // nothing selected: an edit without a target says so
      const none = await m.call("edit_text", { text: "x" });
      expect(none.isError).toBe(true);
      expect(textOf(none)).toContain("Nothing is selected");

      const h2Line = lineOf(root, "<h2");
      const sel = jsonOf<{ selection: { tag: string; at: { line: number }; component: { name: string } } }>(await m.call("select_element", { target: { file: CARD, line: h2Line, column: 12 } }));
      expect(sel.selection).toMatchObject({ tag: "h2", at: { line: h2Line, column: 9 }, component: { name: "ProfileCard" } });
      const sent = shell.received.find((r) => r.name === "select")!.params as { raw: string; offset: number };
      expect(sent.raw.slice(sent.offset)).toMatch(/^<h2/);

      const got = jsonOf<{ selection: { tag: string }; element: { tag: string; attrs: unknown[] } }>(await m.call("get_selection"));
      expect(got.element.tag).toBe("h2");

      // the edit goes to the window's selection, and the window is asked to select the element again after HMR
      const r = jsonOf<{ diff: string }>(await m.call("set_attribute", { name: "class", value: "font-bold text-lg" }));
      expect(r.diff).toContain('<h2 class="font-bold text-lg">');
      await new Promise((ok) => setTimeout(ok, 10));
      expect(shell.received.at(-1)!.name).toBe("reselect");

      const status = jsonOf<{ window: { connected: boolean; frames: Array<Record<string, unknown>>; selection: { tag: string } } }>(await m.call("get_status"));
      expect(status.window.connected).toBe(true);
      expect(status.window.frames[0]).not.toHaveProperty("nonce");
      expect(status.window.selection.tag).toBe("h2");

      const tree = await m.call("get_tree");
      expect(textOf(tree)).toBe('Host <app-host> id=c0\n  ProfileCard <app-profile-card> id=c1 "Ada"');
      const signals = jsonOf<{ signals: Array<{ name: string; value: string }> }>(await m.call("get_signals"));
      expect(signals.signals).toEqual([{ id: "s1", name: "followed", kind: "signal", writable: true, value: "false" }]);

      // a window error comes back as a tool error
      const bad = await m.call("select_element", { selector: "h2" });
      expect(bad.isError).toBe(true);
      expect(textOf(bad)).toContain("selectors are not faked");

      // performance: the window measures; reload asks it to re-run on a fresh load first
      const perf = jsonOf<{ report: { metrics: Array<{ id: string; rating: string; element: { node: { id: string } } }> }; after: string }>(await m.call("get_performance", { reload: true }));
      expect(shell.received.at(-1)).toMatchObject({ name: "performance", params: { reload: true } });
      expect(perf.after).toBe("Re-run");
      expect(perf.report.metrics[0]).toMatchObject({ id: "lcp", rating: "good", element: { node: { id: "t1:4" } } });
      const unmeasured = jsonOf<{ report: null; error: string }>(await m.call("get_performance"));
      expect(shell.received.at(-1)).toMatchObject({ name: "performance", params: { reload: false } });
      expect(unmeasured).toMatchObject({ report: null, error: "The page could not be measured." });

      // screenshot: no CDP port and no browser here, so it explains what is missing
      const shot = await m.call("screenshot");
      expect(shot.isError).toBe(true);
      expect(textOf(shot)).toContain("GABLE_CHROME");
    } finally {
      shell.disconnect();
      await m.close();
    }
  });

  it("times out a window that does not answer", async () => {
    const bridge = new ShellBridge();
    bridge.connect(() => undefined);
    await expect(bridge.call("snapshot", undefined, 50)).rejects.toThrow(/did not answer "snapshot"/);
    bridge.close();
  });
});

// --- session file and HTTP --------------------------------------------------------------------------------------------

describe("mcp: session file", () => {
  it("is found while its process lives, and removed only by its own session", () => {
    const dir = mkdtempSync(join(tmpdir(), "gable-mcp-session-"));
    const s = { root: "/some/project", url: "http://127.0.0.1:1/mcp", token: "t1", shell: "http://127.0.0.1:1/", pid: process.pid };
    writeSession(s, dir);
    expect(readSession("/some/project", dir)).toEqual(s);
    removeSession("/some/project", "other", dir);
    expect(readSession("/some/project", dir)).toEqual(s);
    removeSession("/some/project", "t1", dir);
    expect(readSession("/some/project", dir)).toBeNull();
    writeSession({ ...s, pid: 2 ** 30 }, dir);
    expect(readSession("/some/project", dir)).toBeNull();
  });
});

describe("mcp: streamable HTTP endpoint", () => {
  it("refuses calls without the token or under another Host, and serves a client that has it", async () => {
    const root = copyFixture(mkdtempSync(join(tmpdir(), "gable-mcp-http-")));
    const backend = await startBackend({ root, mcpSessionDir: false });
    try {
      expect(backend.mcp.url).toBe(`${backend.url}/mcp`);
      expect(backend.mcp.token).not.toBe(backend.token);
      const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } } });
      const post = (headers: Record<string, string>) => fetch(backend.mcp.url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: init });
      expect((await post({})).status).toBe(401);
      expect((await post({ authorization: "Bearer wrong" })).status).toBe(401);
      // the shell's token is not the MCP token
      expect((await post({ authorization: `Bearer ${backend.token}` })).status).toBe(401);
      const rebound = await new Promise<number>((ok) => {
        const req = httpRequest(backend.mcp.url, { method: "POST", headers: { authorization: `Bearer ${backend.mcp.token}`, host: "evil.example", "content-type": "application/json" } }, (res) => ok(res.statusCode ?? 0));
        req.end(init);
      });
      expect(rebound).toBe(403);

      const client = new Client({ name: "test", version: "1" });
      await client.connect(new StreamableHTTPClientTransport(new URL(backend.mcp.url), { requestInit: { headers: { authorization: `Bearer ${backend.mcp.token}` } } }));
      try {
        expect((await client.listTools()).tools.length).toBeGreaterThan(20);
        const status = jsonOf<{ project: { root: string }; window: { connected: boolean; open: string } }>((await client.callTool({ name: "get_status", arguments: {} })) as CallToolResult);
        expect(status.window).toEqual({ connected: false, open: `${backend.url}/` });

        // a window on the shell channel answers the agent's commands
        const ac = new AbortController();
        const channel = await fetch(`${backend.url}/api/shell/channel?token=${backend.token}`, { signal: ac.signal });
        expect(channel.status).toBe(200);
        const reader = channel.body!.getReader();
        const pending = client.callTool({ name: "set_mode", arguments: { mode: "interact" } }) as Promise<CallToolResult>;
        let buffer = "";
        let command: ControlRequest | null = null;
        while (!command) {
          const { value } = await reader.read();
          buffer += new TextDecoder().decode(value);
          const m = /event: command\ndata: (.*)\n\n/.exec(buffer);
          if (m) command = JSON.parse(m[1]!) as ControlRequest;
        }
        expect(command).toMatchObject({ name: "setMode", params: { mode: "interact" } });
        const snap = new FakeShell(new ShellBridge(), root).snapshot();
        const reply = await fetch(`${backend.url}/api/shell/reply`, { method: "POST", headers: { authorization: `Bearer ${backend.token}`, "content-type": "application/json" }, body: JSON.stringify({ id: command.id, ok: true, result: { ...snap, mode: "interact" } }) });
        expect(await reply.json()).toEqual({ ok: true });
        expect(jsonOf<{ mode: string }>(await pending).mode).toBe("interact");
        ac.abort();
      } finally {
        await client.close();
      }
    } finally {
      await backend.close();
    }
  }, 30000);
});
