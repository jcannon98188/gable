// State history (time travel) in the devtools layer: what is recorded, how steps group, travel back and forward, the bounds.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { effect, html, inject, model, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { createDevtools, type DevtoolsEvent, type DevtoolsInstance, type HistoryInfo, type TravelResult } from "@gable/core/devtools";
import { MAX_HISTORY_STEPS, MAX_HISTORY_WRITES } from "./signal-history.js";

let dt: DevtoolsInstance;
const target: Parameters<typeof createDevtools>[0] = {};
beforeEach(() => {
  dt = createDevtools(target);
});
afterEach(() => dt.dispose());

const call = <T>(method: string, params?: unknown) => dt.hook.call(method as never, params as never) as T;
const history = () => call<HistoryInfo>("history");
const travel = (seq: number) => call<TravelResult>("travel", { seq });
/** Lets the step of this task commit, and the travel mute end: both happen on the next task. */
const tick = () => new Promise((r) => setTimeout(r, 0));

class Board {
  static meta = { selector: "app-board", template: html`<p>{{ count() }} {{ label() }}</p>` };
  count = signal(0);
  label = signal("a");
  /** Derived by an effect: the app's answer to a change of `count`. */
  echo = signal(0);
  _echo = effect(() => this.echo.set(this.count() * 10));
  both(n: number, label: string): void {
    this.count.set(n);
    this.label.set(label);
  }
}

describe("state history", () => {
  it("records nothing until it is turned on", async () => {
    const f = mount(Board);
    f.instance.count.set(1);
    await tick();
    expect(history()).toMatchObject({ recording: false, steps: [] });
  });

  it("groups one task's writes, the effects' answers included, into a step, with each value before and after, named after its field", async () => {
    const f = mount(Board);
    const events: DevtoolsEvent[] = [];
    dt.hook.connect((e) => events.push(e));
    expect(call("recordHistory", { on: true })).toEqual({ recording: true });
    f.instance.both(2, "b");
    f.instance.both(3, "c");
    await tick();
    const h = history();
    // The effect's write to `echo` came on the flush's microtask: part of the same step.
    expect(h.steps.map((s) => s.writes.map((w) => `${w.name} ${w.before.s}→${w.after.s}`))).toEqual([["count 0→3", "label \"a\"→\"c\"", "echo 0→30"]]);
    expect(h.steps[0]).toMatchObject({ seq: 1, source: "app", more: 0, writes: [{ owner: "Board" }, { owner: "Board" }, { owner: "Board" }] });
    expect(h.cursor).toBeNull();
    expect(events.filter((e) => e.type === "history")).toEqual([{ type: "history", seq: 1 }]);
  });

  it("records the fields of components and services only: not the framework's own signals (a @for row's item and count)", async () => {
    class Cart {
      static scope = "root";
      items = signal<string[]>([]);
    }
    class Shelf {
      lit = signal(false);
    }
    class Shop {
      static meta = {
        selector: "app-shop",
        providers: [Shelf],
        template: html`<ul>@for (i of cart.items(); track i) {<li>{{ i }}</li>}</ul><b>{{ shelf.lit() }}</b>`,
      };
      cart = inject(Cart);
      shelf = inject(Shelf);
      local = (() => {
        const hidden = signal(0);
        return () => hidden.set(hidden() + 1);
      })();
    }
    const f = mount(Shop);
    call("recordHistory", { on: true });
    f.instance.cart.items.set(["a"]);
    f.instance.shelf.lit.set(true);
    f.instance.local();
    await tick();
    f.flushSync();
    f.instance.cart.items.set(["a", "b"]);
    await tick();
    f.flushSync();
    await tick();
    expect(f.text()).toBe("abtrue");
    const steps = history().steps.map((s) => s.writes.map((w) => `${w.owner}.${w.name}`));
    expect(steps).toEqual([["Cart.items", "Shelf.lit"], ["Cart.items"]]);
    travel(history().steps[0]!.seq - 1);
    f.flushSync();
    expect(f.text()).toBe("false");
  });

  it("leaves out writes that change nothing", async () => {
    const f = mount(Board);
    call("recordHistory", { on: true });
    f.instance.label.set("x");
    f.instance.label.set("a");
    await tick();
    expect(history().steps).toEqual([]);
  });

  it("travels back and forward: the view shows each state, and the app's answers to travel are not recorded", async () => {
    const f = mount(Board);
    call("recordHistory", { on: true });
    f.instance.both(1, "b");
    await tick();
    f.instance.both(2, "c");
    await tick();
    f.flushSync();
    expect(f.text()).toBe("2 c");
    const steps = history().steps.map((s) => s.seq);
    expect(steps.length).toBe(2);

    expect(travel(steps[0]! - 1)).toEqual({ ok: true, seq: 0, applied: 3, gone: 0, incomplete: false });
    f.flushSync();
    expect(f.text()).toBe("0 a");
    expect(f.instance.echo()).toBe(0);
    await tick();
    expect(history()).toMatchObject({ cursor: 0 });
    expect(history().steps.length).toBe(2);

    expect(travel(steps[0]!)).toMatchObject({ ok: true, applied: 3 });
    f.flushSync();
    expect(f.text()).toBe("1 b");
    expect(f.instance.echo()).toBe(10);
    expect(travel(steps[1]!)).toMatchObject({ ok: true });
    f.flushSync();
    expect(f.text()).toBe("2 c");
    expect(history().cursor).toBeNull();
    await tick();

    // A new write after travelling is recorded again, and the history runs live.
    travel(steps[0]!);
    await tick();
    f.instance.label.set("z");
    await tick();
    expect(history()).toMatchObject({ cursor: null });
    expect(history().steps.at(-1)!.writes.map((w) => w.name)).toEqual(["label"]);
  });

  it("refuses a step it does not hold", async () => {
    mount(Board);
    call("recordHistory", { on: true });
    expect(travel(1)).toEqual({ ok: false, error: "No state history is recorded." });
  });

  it("records a tool's write (setSignal) as a designer step", async () => {
    const f = mount(Board);
    call("recordHistory", { on: true });
    const id = call<{ signals: Array<{ id: string; name: string }> }>("component", { id: dt.hook.componentFor(f.root)! }).signals.find((s) => s.name === "label")!.id;
    expect(call("setSignal", { id, text: '"tool"' })).toEqual({ ok: true });
    await tick();
    expect(history().steps[0]).toMatchObject({ source: "designer", writes: [{ name: "label", before: { s: '"a"' }, after: { s: '"tool"' } }] });
  });

  it("sets a model through its setter, so the parent's binding follows", async () => {
    class Toggle {
      static meta = { selector: "app-toggle", template: html`<i>{{ on() }}</i>` };
      on = model(false);
    }
    class Host {
      static meta = { selector: "app-host", imports: [Toggle], template: html`<app-toggle [(on)]="open"></app-toggle><b>{{ open() }}</b>` };
      open = signal(false);
    }
    const f = mount(Host);
    call("recordHistory", { on: true });
    f.instance.open.set(true);
    await tick();
    f.flushSync();
    expect(f.text()).toBe("truetrue");
    travel(history().steps[0]!.seq - 1);
    f.flushSync();
    expect(f.text()).toBe("falsefalse");
  });

  it("counts a destroyed component's signals as gone", async () => {
    const f = mount(Board);
    call("recordHistory", { on: true });
    f.instance.count.set(5);
    await tick();
    const first = history().steps[0]!.seq;
    f.destroy();
    expect(travel(first - 1)).toMatchObject({ ok: true, applied: 0, gone: 2 });
  });

  it("is bounded: the oldest steps go first, and travel to the earliest kept state is still right", async () => {
    const f = mount(Board);
    call("recordHistory", { on: true });
    // `label` only: one write per step (the echo effect follows count, not label).
    for (let i = 1; i <= MAX_HISTORY_STEPS + 20; i++) {
      f.instance.label.set(`v${i}`);
      await tick();
    }
    await tick();
    const h = history();
    expect(h.steps.length).toBe(MAX_HISTORY_STEPS);
    expect(h.dropped).toBe(20);
    expect(h.maxWrites).toBe(MAX_HISTORY_WRITES);
    travel(h.steps[0]!.seq - 1);
    expect(f.instance.label()).toBe("v20");
  });

  it("clears", async () => {
    const f = mount(Board);
    call("recordHistory", { on: true });
    f.instance.label.set("q");
    await tick();
    expect(call("clearHistory")).toBe(true);
    expect(history()).toMatchObject({ steps: [], cursor: null, dropped: 0 });
    call("recordHistory", { on: false });
    f.instance.label.set("r");
    await tick();
    expect(history().steps).toEqual([]);
  });
});
