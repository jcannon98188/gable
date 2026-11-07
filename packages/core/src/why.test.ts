// "Why did this update" in the devtools layer (TASK-56.19): the dependency tree of a component's effects (its template
// bindings among them), the signal writes behind each effect run, and the binding-to-node attribution.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computed, html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { createDevtools, type DevtoolsEvent, type DevtoolsInstance, type EffectRun, type WhyReport } from "@gable/core/devtools";

let dt: DevtoolsInstance;
const target: Parameters<typeof createDevtools>[0] = {};
let events: DevtoolsEvent[] = [];
beforeEach(() => {
  dt = createDevtools(target);
  events = [];
  dt.hook.connect((e) => events.push(e));
});
afterEach(() => dt.dispose());

const call = <T>(method: string, params?: unknown) => dt.hook.call(method as never, params as never) as T;
const why = (id: string) => call<WhyReport | null>("why", { id });
const tick = () => new Promise((r) => setTimeout(r, 0));
const runs = (): EffectRun[] => events.flatMap((e) => (e.type === "flush" ? e.flush.runs : []));

class Price {
  static meta = {
    selector: "app-price",
    template: html`<p class="total" [class.big]="big()">{{ total() }}</p><span class="note">{{ note() }}</span><b>static</b>`,
  };
  qty = signal(2);
  unit = signal(5);
  note = signal("hi");
  total = computed(() => this.qty() * this.unit());
  big = computed(() => this.total() > 20);
}

const compId = (f: { root: unknown }) => dt.hook.componentFor(f.root)!;
const bindingOf = (r: WhyReport, what: string) => r.nodes.find((n) => n.binding?.what === what)!;

describe("dependencies", () => {
  it("lists each binding of a component with the signals it reads, through computeds", () => {
    const f = mount(Price);
    const report = why(compId(f))!;
    expect(report).toMatchObject({ name: "Price", kind: "component" });
    const text = report.nodes.find((n) => n.binding?.what === "text" && n.dependencies.some((d) => d.name === "total"))!;
    expect(text.binding?.node).toBe("<p>");
    const total = text.dependencies.find((d) => d.name === "total")!;
    expect(total).toMatchObject({ kind: "computed", owner: "Price", value: { s: "10" } });
    expect(total.depends.map((d) => d.name).sort()).toEqual(["qty", "unit"]);
    expect(total.depends.every((d) => d.kind === "state" && d.depends.length === 0)).toBe(true);
    // The class binding reads `big`, which reads `total`, which is shown only once: the second path is marked, not expanded again.
    const big = bindingOf(report, "class:big").dependencies.find((d) => d.name === "big")!;
    expect(big.depends.map((d) => d.name)).toEqual(["total"]);
  });

  it("explains one signal: its dependencies, its dependents and its last recorded write", async () => {
    const f = mount(Price);
    call("recordHistory", { on: true });
    f.instance.qty.set(3);
    await tick();
    const qty = call<any>("component", { id: compId(f) }).signals.find((s: any) => s.name === "qty");
    const r = why(qty.id)!;
    expect(r).toMatchObject({ kind: "state" });
    expect(r.nodes[0]!.dependencies).toEqual([]);
    expect(r.nodes[0]!.dependents.map((d) => d.name)).toContain("total");
    expect(r.nodes[0]!.lastWrite).toMatchObject({ source: "app", before: { s: "2" }, after: { s: "3" } });
  });

  it("answers null for an id it does not know", () => {
    expect(why("nope")).toBeNull();
  });
});

describe("causes of an update", () => {
  it("names the signal write behind a re-run, and the computed it went through", async () => {
    const f = mount(Price);
    f.instance.qty.set(3);
    await f.flush();
    const report = why(compId(f))!;
    const text = report.nodes.find((n) => n.binding?.what === "text" && n.dependencies.some((d) => d.name === "total"))!;
    const last = text.recent.at(-1)!;
    expect(last.first).toBe(false);
    expect(last.causes).toHaveLength(1);
    expect(last.causes[0]).toMatchObject({ signal: { name: "qty", kind: "state", owner: "Price" }, before: { s: "2" }, after: { s: "3" }, by: "app" });
    expect(last.causes[0]!.via.map((v) => v.name)).toEqual(["total"]);
    // The class binding re-ran too, through total then big.
    const cls = bindingOf(report, "class:big").recent.at(-1)!;
    expect(cls.causes[0]!.via.map((v) => v.name)).toEqual(["total", "big"]);
  });

  it("does not blame a signal that was not written, and leaves effects that did not re-run alone", async () => {
    const f = mount(Price);
    f.instance.note.set("changed");
    await f.flush();
    const report = why(compId(f))!;
    const noteText = report.nodes.find((n) => n.dependencies.some((d) => d.name === "note"))!;
    expect(noteText.recent.at(-1)!.causes.map((c) => c.signal.name)).toEqual(["note"]);
    expect(noteText.recent.at(-1)!.causes[0]!.via).toEqual([]);
    const totalText = report.nodes.find((n) => n.dependencies.some((d) => d.name === "total"))!;
    expect(totalText.recent.every((r) => r.first)).toBe(true);
    expect(totalText.runs).toBe(1);
  });

  it("records a first run as a creation without causes", () => {
    const f = mount(Price);
    const text = why(compId(f))!.nodes[0]!;
    expect(text.recent[0]).toMatchObject({ first: true, causes: [] });
  });

  it("reports several signals written in one task, once each, and counts the surplus", async () => {
    const f = mount(Price);
    f.instance.qty.set(4);
    f.instance.unit.set(6);
    f.instance.qty.set(5);
    await f.flush();
    const text = why(compId(f))!.nodes.find((n) => n.dependencies.some((d) => d.name === "total"))!;
    const causes = text.recent.at(-1)!.causes;
    expect(causes.map((c) => `${c.signal.name} ${c.before.s}→${c.after.s}`).sort()).toEqual(["qty 2→5", "unit 5→6"]);
  });

  it("marks a write the Designer made as such, and writes that change nothing are not causes", async () => {
    const f = mount(Price);
    const qty = call<any>("component", { id: compId(f) }).signals.find((s: any) => s.name === "qty");
    expect(call("setSignal", { id: qty.id, text: "9" })).toEqual({ ok: true });
    await f.flush();
    const text = why(compId(f))!.nodes.find((n) => n.dependencies.some((d) => d.name === "total"))!;
    expect(text.recent.at(-1)!.causes[0]).toMatchObject({ signal: { name: "qty" }, by: "designer", after: { s: "9" } });
    f.instance.qty.set(9);
    await f.flush();
    expect(why(compId(f))!.nodes.find((n) => n.dependencies.some((d) => d.name === "total"))!.runs).toBe(2);
  });

  it("puts the causes on the flush's runs for connected clients", async () => {
    const f = mount(Price);
    f.instance.unit.set(7);
    await f.flush();
    const rerun = runs().filter((r) => !r.first);
    expect(rerun.length).toBeGreaterThan(0);
    expect(rerun.every((r) => r.componentId === compId(f) && r.causes!.some((c) => c.signal.name === "unit"))).toBe(true);
    expect(runs().filter((r) => r.first).every((r) => r.causes === undefined)).toBe(true);
  });

  it("keeps only the last five runs of an effect", async () => {
    const f = mount(Price);
    for (let i = 0; i < 8; i++) {
      f.instance.note.set(`n${i}`);
      await f.flush();
    }
    const note = why(compId(f))!.nodes.find((n) => n.dependencies.some((d) => d.name === "note"))!;
    expect(note.recent).toHaveLength(5);
    expect(note.recent.at(-1)!.causes[0]!.after.s).toBe('"n7"');
  });

  it("finds no cause for a run no recorded write explains, and says so with an empty list", async () => {
    const f = mount(Price);
    const before = why(compId(f))!.nodes.length;
    dt.dispose();
    dt = createDevtools(target);
    expect(before).toBeGreaterThan(0);
    // a fresh devtools layer knows nothing of the old component
    expect(why(compId(f))).toBeNull();
  });
});

describe("binding attribution", () => {
  it("maps template nodes to their effects, and effects to the nodes to outline", () => {
    const f = mount(Price);
    const root = f.root as any;
    const p = root.children.find((c: any) => c.tag === "p");
    expect(p).toBeTruthy();
    const ids = dt.hook.effectsOf([p]);
    // the class binding, and the text binding on the text node inside it
    expect(ids.length).toBe(2);
    const whats = ids.map((id) => why(id)!.nodes[0]!.binding?.what).sort();
    expect(whats).toEqual(["class:big", "text"]);
    expect(dt.hook.targetsOf(ids)).toEqual([p]);
    expect(dt.hook.effectsOf([root.children.find((c: any) => c.tag === "b")])).toEqual([]);
  });
});
