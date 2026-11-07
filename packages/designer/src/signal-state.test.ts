// Signal state editing (TASK-56.17): the value checks, the TypeScript literal printer, and "Save as Scenario"'s writer
// (`addScene` with `inputs` and `state`).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computed, html, input, signal } from "@gable/core";
import { createDevtools, type ComponentDetail } from "@gable/core/devtools";
import { mount } from "@gable/testing";
import { FIGHT_LIMIT, SignalState } from "./agent/signal-state.js";
import { EditService } from "./server/edit/service.js";
import type { EditResult } from "./server/edit/types.js";
import { jsLiteral, parseValue, shapeProblems } from "./signal-value.js";

describe("signal values", () => {
  it("parses JSON and undefined", () => {
    expect(parseValue(" 3 ")).toEqual({ ok: true, value: 3 });
    expect(parseValue("undefined")).toEqual({ ok: true, value: undefined });
    expect(parseValue("{a:1}")).toMatchObject({ ok: false, error: expect.stringMatching(/Not valid JSON/) });
  });

  it("checks a new value against the shape of the current one", () => {
    expect(shapeProblems(1, 2)).toEqual([]);
    expect(shapeProblems(1, "2")).toEqual(["value was a number, not a string."]);
    expect(shapeProblems(null, { any: "thing" })).toEqual([]);
    expect(shapeProblems(undefined, 5)).toEqual([]);
    expect(shapeProblems([], [1, "a"])).toEqual([]);
    expect(shapeProblems([{ id: 1, done: false }], [{ id: 2, done: true }, { id: 3 }])).toEqual(["value[1].done is missing."]);
    expect(shapeProblems({ a: 1, b: { c: "x" } }, { a: 1, b: { c: 2 }, d: 0 })).toEqual(["value.b.c was a string, not a number.", "value.d is new."]);
    expect(shapeProblems({ a: 1 }, [1])).toEqual(["value was an object, not an array."]);
    expect(shapeProblems("x", null)).toEqual(["value was a string, not null."]);
  });

  it("prints plain data as a TypeScript literal in the file's quote style", () => {
    expect(jsLiteral({ count: 3, "two words": ["a", "it's"], nested: { ok: null } }, "'")).toBe(`{ count: 3, 'two words': ['a', 'it\\'s'], nested: { ok: null } }`);
    expect(jsLiteral({ q: 'say "hi"' }, '"')).toBe(`{ q: "say \\"hi\\"" }`);
    expect(jsLiteral({ q: 'say "hi"' }, "'")).toBe(`{ q: 'say "hi"' }`);
    expect(jsLiteral([], "'")).toBe("[]");
    expect(jsLiteral({}, "'")).toBe("{}");
  });
});

const SCENES = `import type { ComponentScenes } from '@gable/core/tooling';
import { TodoList } from './todo-list.js';

const base = { inputs: { title: 'Todos' } };

export default {
  component: TodoList,
  scenes: {
    Default: { description: 'Empty', inputs: { title: 'Todos' } },
    Filled: {
      description: 'Some items',
      inputs: { title: 'Mine', filter: 'all' },
      state: { items: [] },
    },
    Plain: {},
    Shared: base,
    Shorthand: { description: 'x', ...base },
  },
} satisfies ComponentScenes<TodoList>;
`;

const ok = (r: EditResult) => {
  if (!r.ok) throw new Error(`${r.code}: ${r.error}`);
  return r;
};

function scenes(source = SCENES) {
  const root = mkdtempSync(join(tmpdir(), "gable-state-"));
  mkdirSync(join(root, "src"));
  const file = join(root, "src", "todo-list.scenes.ts");
  writeFileSync(file, source);
  const svc = new EditService(root);
  const add = (op: { name: string; from?: string; description?: string; inputs?: Record<string, unknown>; state?: Record<string, unknown> }) =>
    svc.apply({ op: "addScene", file: "/src/todo-list.scenes.ts", ...op });
  return { svc, add, text: () => readFileSync(file, "utf8") };
}

describe("Save as Scenario writer", () => {
  it("replaces a written value in place and appends what is missing, in a copy of a single-line scene", () => {
    const s = scenes();
    ok(s.add({ name: "Busy", description: "Poked", from: "Default", inputs: { title: "Busy" }, state: { items: [{ id: 1, title: "Milk" }], filter: "done" } }));
    expect(s.text()).toContain(`    Busy: { description: 'Poked', inputs: { title: 'Busy' }, state: { items: [{ id: 1, title: 'Milk' }], filter: 'done' } },\n  },`);
  });

  it("keeps a multi-line copy's layout", () => {
    const s = scenes();
    ok(s.add({ name: "More", from: "Filled", inputs: { filter: "active", page: 2 }, state: { items: ["a"] } }));
    expect(s.text()).toContain(
      `    More: {\n      inputs: { title: 'Mine', filter: 'active', page: 2 },\n      state: { items: ['a'] },\n    },\n  },`,
    );
  });

  it("spreads a scene or an inputs object that is not a literal", () => {
    const s = scenes();
    ok(s.add({ name: "FromShared", from: "Shared", inputs: { title: "T" } }));
    expect(s.text()).toContain(`    FromShared: { ...base, inputs: { ...base.inputs, title: 'T' } },`);
    ok(s.add({ name: "FromSpread", from: "Shorthand", description: "y", inputs: { done: true } }));
    expect(s.text()).toContain(`    FromSpread: { description: 'y', ...base, inputs: { ...base.inputs, done: true } },`);
  });

  it("writes a new scene from nothing, and an empty one gets the objects", () => {
    const s = scenes();
    ok(s.add({ name: "New", state: { count: 2 } }));
    expect(s.text()).toContain(`    New: { state: { count: 2 } },`);
    ok(s.add({ name: "FromPlain", from: "Plain", inputs: { title: "P" } }));
    expect(s.text()).toContain(`    FromPlain: { inputs: { title: 'P' } },`);
  });

  it("is one undoable change, and refuses field names that are not identifiers", () => {
    const s = scenes();
    ok(s.add({ name: "Busy", from: "Default", state: { items: [] } }));
    ok(s.svc.undo());
    expect(s.text()).toBe(SCENES);
    expect(s.add({ name: "Bad", state: { "not a field": 1 } })).toMatchObject({ ok: false, code: "invalid" });
    expect(s.text()).toBe(SCENES);
  });
});

describe("Preview agent signal state", () => {
  class Row {
    static meta = { selector: "app-row", template: html`<i>{{ open() }}</i>` };
    open = signal(false);
  }
  class List {
    static meta = { selector: "app-list", imports: [Row], template: html`<p>{{ title() }} {{ count() }}</p><app-row></app-row>` };
    title = input("List");
    count = signal(1);
    items = signal([{ id: 1, done: false }]);
    when = signal(new Date(0));
    doubled = computed(() => this.count() * 2);
  }

  const clock = 0;
  function setup() {
    const target: Parameters<typeof createDevtools>[0] = {};
    const dt = createDevtools(target);
    const f = mount(List);
    const state = new SignalState(() => dt.hook, () => ({ module: "/src/list.scenes.ts", component: "List", current: "Default" }), () => clock);
    dt.hook.connect((e) => state.onEvent(e));
    void state.sync();
    const detail = dt.hook.call("component", { id: dt.hook.componentFor(f.root)! }) as ComponentDetail;
    const id = (name: string) => [...detail.signals, ...detail.inputs].find((s) => s.name === name)!.id;
    const settle = async () => {
      for (let i = 0; i < 4; i++) await f.flush();
    };
    return { dt, f, state, id, settle, [Symbol.dispose]: () => (f.destroy(), dt.dispose()) };
  }

  it("checks a write against the current value's shape, unless forced", async () => {
    using s = setup();
    expect(await s.state.set(s.id("count"), '"three"')).toMatchObject({ ok: false, problems: ["value was a number, not a string."] });
    expect(await s.state.set(s.id("items"), '[{"id":2}]')).toMatchObject({ ok: false, problems: ["value[0].done is missing."] });
    expect(await s.state.set(s.id("count"), "3")).toEqual({ ok: true });
    expect(await s.state.set(s.id("doubled"), "3")).toMatchObject({ ok: false, error: expect.stringMatching(/not writable/) });
    expect(await s.state.set(s.id("when"), "0")).toMatchObject({ ok: false, error: expect.stringMatching(/Date.*force/) });
    expect(await s.state.set(s.id("count"), '"three"', true)).toEqual({ ok: true });
    expect(s.f.instance.count()).toBe("three");
  });

  it("re-applies a pin when the app changes the signal, and unpins", async () => {
    using s = setup();
    expect(await s.state.pin(s.id("count"), "7")).toEqual({ ok: true });
    s.f.instance.count.set(1);
    await s.settle();
    expect(s.f.instance.count()).toBe(7);
    expect(s.state.pins()).toEqual([{ id: s.id("count"), name: "count", owner: "List", text: "7", status: "active" }]);
    await s.state.pin(s.id("count"), null);
    s.f.instance.count.set(2);
    await s.settle();
    expect(s.f.instance.count()).toBe(2);
    expect(s.state.pins()).toEqual([]);
  });

  it("suspends a pin the app keeps overwriting", async () => {
    using s = setup();
    await s.state.pin(s.id("count"), "7");
    for (let i = 0; i < FIGHT_LIMIT + 2; i++) {
      s.f.instance.count.set(100 + i);
      await s.settle();
    }
    const [pin] = s.state.pins();
    expect(pin).toMatchObject({ status: "suspended", reason: expect.stringMatching(/overwrote it more than/) });
  });

  it("reports the mounted Component's state for a Scene: poked, changed, and what cannot be saved", async () => {
    using s = setup();
    await s.settle();
    await s.state.set(s.id("count"), "4");
    await s.state.set(s.id("title"), '"Mine"');
    s.f.instance.items.set([]);
    const rowId = s.dt.hook.call("tree", undefined) as Array<{ id: string; name: string }>;
    const row = s.dt.hook.call("component", { id: rowId.find((n) => n.name === "Row")!.id }) as ComponentDetail;
    await s.state.set(row.signals.find((x) => x.name === "open")!.id, "true");
    const report = (await s.state.sceneState())!;
    const field = (name: string) => report.fields.find((x) => x.field === name);
    expect(field("count")).toMatchObject({ kind: "state", text: "4", poked: true, changed: true });
    expect(field("title")).toMatchObject({ kind: "input", text: '"Mine"', poked: true, changed: true });
    expect(field("items")).toMatchObject({ kind: "state", text: "[]", poked: false, changed: true });
    expect(field("when")).toMatchObject({ text: null, error: expect.stringMatching(/Date/) });
    expect(field("doubled")).toBeUndefined();
    expect(report.skipped).toEqual([{ name: "open", owner: "Row", reason: expect.stringMatching(/belongs to Row, not List/) }]);
  });
});
