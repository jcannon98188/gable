import { describe, expect, it } from "vitest";
import { mount } from "@gable/testing";
import { createTestRenderer, createTestRoot, type TestNode } from "@gable/testing/renderer";
import { HmrDemo } from "./demo.js";
import { DemoSession } from "./session.js";
import { EDITS, INITIAL_SOURCE, diffLines } from "./source.js";

// These run the real `@gable/core/hmr` runtime (through DemoSession) against the in-memory test renderer.

const edit = (id: string) => EDITS.find((e) => e.id === id)!;
const find = (node: TestNode, pick: (n: TestNode) => boolean): TestNode | undefined => (pick(node) ? node : node.children.map((c) => find(c, pick)).find(Boolean));
const textOf = (node: TestNode): string => (node.kind === "text" ? node.text : node.children.map(textOf).join(""));
const live = (instance: object | null) => instance as { count: { (): number; set(n: number): void } };

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function start() {
  const root = createTestRoot();
  const session = new DemoSession({ renderer: createTestRenderer(), target: root });
  session.start();
  const click = async () => {
    find(root, (n) => n.tag === "button")!.listeners["click"]![0]!({});
    await tick();
  };
  return { root, session, click, count: () => live(session.instance).count(), text: () => textOf(root) };
}

describe("DemoSession (the real @gable/core/hmr runtime)", () => {
  it("mounts the original source", async () => {
    const d = start();
    expect(d.text()).toContain("Count: 0");
    expect(d.text()).toContain("Doubled: 0");
  });

  it("a template edit keeps the count and the same instance", async () => {
    const d = start();
    for (let i = 0; i < 7; i++) await await d.click();
    const before = d.session.instance;
    const out = d.session.save(edit("button").apply(INITIAL_SOURCE)!);
    await tick();
    expect(out.status).toBe("applied");
    expect(out.sameInstance).toBe(true);
    expect(d.session.instance).toBe(before);
    expect(d.count()).toBe(7);
    expect(textOf(find(d.root, (n) => n.tag === "button")!)).toBe("Add one");
    expect(d.text()).toContain("Count: 7");
  });

  it("a computed edit re-creates the instance, carries the state and uses the new rule", async () => {
    const d = start();
    for (let i = 0; i < 7; i++) await await d.click();
    const before = d.session.instance;
    const out = d.session.save(edit("triple").apply(INITIAL_SOURCE)!);
    await tick();
    expect(out.status).toBe("applied");
    expect(d.session.instance).not.toBe(before);
    expect(d.count()).toBe(7);
    expect(d.text()).toContain("Tripled: 21");
    expect(out.carried.map((f) => f.name).sort()).toEqual(["count", "name"]);
    expect(out.rederived.map((f) => f.name)).toEqual(["doubled"]);
    expect(out.added).toEqual([]);
    expect(out.dropped).toEqual([]);
  });

  it("an added field is initialised and the count is kept", async () => {
    const d = start();
    for (let i = 0; i < 3; i++) await await d.click();
    const out = d.session.save(edit("label").apply(INITIAL_SOURCE)!);
    await tick();
    expect(out.status).toBe("applied");
    expect(out.added).toEqual([{ name: "label", kind: "signal", value: '"Clicks"' }]);
    expect(d.text()).toContain("Clicks: 3");
  });

  it("a removed field is dropped and the rest carries on", async () => {
    const d = start();
    for (let i = 0; i < 4; i++) await await d.click();
    const out = d.session.save(edit("remove").apply(INITIAL_SOURCE)!);
    await tick();
    expect(out.status).toBe("applied");
    expect(out.dropped.map((f) => f.name)).toEqual(["doubled"]);
    expect(d.count()).toBe(4);
    expect(d.text()).not.toContain("Doubled");
    expect(d.text()).toContain("Count: 4");
  });

  it("a syntax error rolls back and leaves the running component alone", async () => {
    const d = start();
    for (let i = 0; i < 7; i++) await await d.click();
    const before = d.session.instance;
    const out = d.session.save(edit("syntax").apply(INITIAL_SOURCE)!);
    await tick();
    expect(out.status).toBe("invalid");
    expect(out.error).toBeTruthy();
    expect(d.session.instance).toBe(before);
    expect(d.count()).toBe(7);
    expect(d.text()).toContain("Count: 7");
  });

  it("a field that throws while the new class is built rolls back, and the next good save works", async () => {
    const d = start();
    for (let i = 0; i < 7; i++) await await d.click();
    const before = d.session.instance;
    const out = d.session.save(edit("throws").apply(INITIAL_SOURCE)!);
    await tick();
    expect(out.status).toBe("rolled-back");
    expect(out.error).toContain("boom");
    expect(d.session.instance).toBe(before);
    expect(d.count()).toBe(7);
    await d.click();
    expect(d.text()).toContain("Count: 8");
    expect(d.session.save(edit("button").apply(INITIAL_SOURCE)!).status).toBe("applied");
    expect(d.count()).toBe(8);
  });

  it("saving the running source changes nothing", () => {
    expect(start().session.save(INITIAL_SOURCE).status).toBe("unchanged");
  });

  it("reset starts a fresh component from the original source", async () => {
    const d = start();
    for (let i = 0; i < 5; i++) await await d.click();
    d.session.save(edit("triple").apply(INITIAL_SOURCE)!);
    d.session.reset();
    expect(d.count()).toBe(0);
    expect(d.text()).toContain("Doubled: 0");
    await d.click();
    expect(d.session.save(edit("button").apply(INITIAL_SOURCE)!).status).toBe("applied");
    expect(d.count()).toBe(1);
  });
});

describe("suggested edits", () => {
  it("every edit applies to the original source and changes it", () => {
    for (const e of EDITS) {
      const next = e.apply(INITIAL_SOURCE);
      expect(next, e.id).not.toBeNull();
      expect(next, e.id).not.toBe(INITIAL_SOURCE);
    }
  });
  it("an edit whose text was edited away reports it instead of guessing", () => {
    expect(edit("button").apply("class Counter {}")).toBeNull();
  });
  it("diffLines keeps only what changed, with context", () => {
    const diff = diffLines("a\nb\nc\nd\ne", "a\nb\nX\nd\ne");
    expect(diff.filter((l) => l.kind !== "same")).toEqual([
      { kind: "del", text: "c" },
      { kind: "add", text: "X" },
    ]);
    expect(diff.length).toBeLessThan(5);
  });
});

describe("HmrDemo component", () => {
  const chip = (f: { root: TestNode }, label: string) => find(f.root, (n) => n.tag === "button" && textOf(n) === label)!;

  it("applies a suggested edit and shows what carried over", async () => {
    const f = mount(HmrDemo);
    await f.flush();
    live(f.instance.session!.instance).count.set(7);
    f.dispatch(chip(f, "Make doubled triple"), "click");
    await f.flush();
    expect(f.instance.outcome()?.status).toBe("applied");
    expect(live(f.instance.session!.instance).count()).toBe(7);
    expect(f.text()).toContain("applied");
    expect(f.text()).toContain("carried over");
    expect(f.text()).toContain("Tripled: 21");
  });

  it("a broken edit shows the error and keeps the state; Undo restores the text", async () => {
    const f = mount(HmrDemo);
    await f.flush();
    live(f.instance.session!.instance).count.set(7);
    f.dispatch(chip(f, "Break it: syntax error"), "click");
    await f.flush();
    expect(f.instance.outcome()?.status).toBe("invalid");
    expect(f.text()).toContain("rolled back");
    expect(live(f.instance.session!.instance).count()).toBe(7);
    expect(f.instance.dirty()).toBe(true);
    f.instance.restore();
    expect(f.instance.dirty()).toBe(false);
    expect(f.instance.source()).toBe(INITIAL_SOURCE);
  });

  it("Reset puts back the original source and a fresh component", async () => {
    const f = mount(HmrDemo);
    await f.flush();
    live(f.instance.session!.instance).count.set(7);
    f.instance.applyEdit(edit("remove"));
    f.instance.reset();
    await f.flush();
    expect(f.instance.source()).toBe(INITIAL_SOURCE);
    expect(f.instance.outcome()).toBeNull();
    expect(live(f.instance.session!.instance).count()).toBe(0);
  });
});
