// @vitest-environment jsdom
// Accessibility (canvas/116): the [a11y] mirror, its recorded twin for the scene test renderer, announceOnChange and
// ReducedMotion. The mirror logic is tested on plain fake nodes; the DOM sink on jsdom; the integration through the real
// renderer on the same manual-scheduler application double the input tests use.
import { Container } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrap, computed, flushSync, html, signal } from "@gable/core";
import { LiveAnnouncer, type Politeness } from "@gable/core/renderer";
import { createDomRenderer } from "@gable/renderer-dom";
import { A11yMirror, type A11yEntry, type A11yNode, type A11yProps } from "./a11y.js";
import { DomA11ySink } from "./a11y-dom.js";
import { A11yRecorder } from "./a11y-testing.js";
import { announceOnChange } from "./announce.js";
import { GableCanvas, ReducedMotion, createPixiRenderer, pixiRenderer, type ApplicationLike, type FrameScheduler, type PixiRendererOptions } from "./index.js";

class FakeNode implements A11yNode {
  visible = true;
  parent: FakeNode | null = null;
  children: FakeNode[] = [];
  bounds = { x: 0, y: 0, width: 10, height: 10 };
  emitted: Array<{ name: string; args: unknown[] }> = [];
  add(child: FakeNode): this {
    child.parent = this;
    this.children.push(child);
    return this;
  }
  getBounds() {
    return this.bounds;
  }
  emit(name: string, ...args: unknown[]): boolean {
    this.emitted.push({ name, args });
    return true;
  }
}

function tree() {
  const root = new FakeNode();
  const mk = (b: Partial<FakeNode["bounds"]> = {}) => {
    const n = new FakeNode();
    Object.assign(n.bounds, b);
    root.add(n);
    return n;
  };
  return { root, mk };
}

describe("A11yMirror", () => {
  it("lists tagged nodes in scene order with role, label and bounds", () => {
    const { root, mk } = tree();
    const a = mk({ x: 1, y: 2, width: 30, height: 40 });
    const wrapper = mk();
    const b = new FakeNode();
    wrapper.add(b);
    const mirror = new A11yMirror<FakeNode>();
    const rec = new A11yRecorder<FakeNode>(mirror);
    mirror.set(b, { role: "img", label: "B" });
    mirror.set(a, { role: "button", label: "A", description: "first" });
    mirror.sync(root);
    expect(rec.a11y()).toEqual([
      { node: a, role: "button", label: "A", description: "first", focusable: true, order: 0, bounds: { x: 1, y: 2, width: 30, height: 40 } },
      { node: b, role: "img", label: "B", description: undefined, focusable: false, order: 1, bounds: { x: 0, y: 0, width: 10, height: 10 } },
    ]);
  });

  it("order overrides scene order; focusable overrides the role default", () => {
    const { root, mk } = tree();
    const a = mk();
    const b = mk();
    const c = mk();
    const mirror = new A11yMirror<FakeNode>();
    const rec = new A11yRecorder<FakeNode>(mirror);
    mirror.set(a, { role: "button", label: "A" });
    mirror.set(b, { role: "button", label: "B", order: -5 });
    mirror.set(c, { role: "img", label: "C", focusable: true });
    mirror.sync(root);
    expect(rec.a11y().map((e) => e.label)).toEqual(["B", "A", "C"]);
    expect(rec.a11y().map((e) => e.focusable)).toEqual([true, true, true]);
  });

  it("untagged, removed, invisible and detached nodes have no mirror", () => {
    const { root, mk } = tree();
    const a = mk();
    const b = mk();
    const c = mk();
    const loose = new FakeNode();
    const mirror = new A11yMirror<FakeNode>();
    const rec = new A11yRecorder<FakeNode>(mirror);
    for (const [n, l] of [[a, "A"], [b, "B"], [c, "C"], [loose, "L"]] as const) mirror.set(n, { role: "button", label: l });
    b.visible = false;
    mirror.sync(root);
    expect(rec.a11y().map((e) => e.label)).toEqual(["A", "C"]); // b invisible, loose detached
    mirror.set(a, null);
    mirror.sync(root);
    expect(rec.a11y().map((e) => e.label)).toEqual(["C"]);
    mirror.remove(c);
    mirror.sync(root);
    expect(rec.a11y()).toEqual([]);
  });

  it("an invisible ancestor hides the descendant; remove() drops the whole subtree", () => {
    const { root, mk } = tree();
    const parent = mk();
    const child = new FakeNode();
    parent.add(child);
    const mirror = new A11yMirror<FakeNode>();
    const rec = new A11yRecorder<FakeNode>(mirror);
    mirror.set(child, { role: "button", label: "child" });
    parent.visible = false;
    mirror.sync(root);
    expect(rec.a11y()).toEqual([]);
    parent.visible = true;
    mirror.sync(root);
    expect(rec.a11y()).toHaveLength(1);
    mirror.remove(parent);
    mirror.sync(root);
    expect(rec.a11y()).toEqual([]);
  });

  it("rejects props without a role or label", () => {
    const mirror = new A11yMirror<FakeNode>();
    expect(() => mirror.set(new FakeNode(), { role: "button" } as unknown as A11yProps)).toThrow(/label/);
    expect(() => mirror.set(new FakeNode(), { label: "x" } as unknown as A11yProps)).toThrow(/role/);
  });

  it("activating dispatches the node's pointertap with a synthetic event at the bounds centre", () => {
    const { root, mk } = tree();
    const a = mk({ x: 10, y: 20, width: 100, height: 50 });
    const mirror = new A11yMirror<FakeNode>();
    mirror.set(a, { role: "button", label: "A" });
    mirror.sync(root);
    expect(mirror.activate(a)).toBe(true);
    expect(a.emitted).toHaveLength(1);
    const [{ name, args }] = a.emitted;
    expect(name).toBe("pointertap");
    expect(args[0]).toMatchObject({ type: "pointertap", target: a, currentTarget: a, global: { x: 60, y: 45 }, pointerType: "a11y" });
    expect(mirror.activate(new FakeNode())).toBe(false); // untagged
  });

  it("activating also fires the other activation handlers the node listens to (pointerup, click, tap), after pointertap order of a real tap", () => {
    const { root, mk } = tree();
    const a = mk();
    const listening = new Set(["click", "tap", "pointerup", "pointermove"]);
    (a as unknown as { listenerCount(name: string): number }).listenerCount = (name) => (listening.has(name) ? 1 : 0);
    const mirror = new A11yMirror<FakeNode>();
    mirror.set(a, { role: "button", label: "A" });
    mirror.sync(root);
    mirror.activate(a);
    expect(a.emitted.map((e) => e.name)).toEqual(["pointerup", "pointertap", "click", "tap"]); // never the hover/tracking ones
    expect(a.emitted.map((e) => (e.args[0] as { type: string }).type)).toEqual(["pointerup", "pointertap", "click", "tap"]);
  });
});

describe("A11yRecorder (the scene test renderer's mirror)", () => {
  function setup() {
    const { root, mk } = tree();
    const [a, b, c] = [mk(), mk(), mk()];
    const mirror = new A11yMirror<FakeNode>();
    const rec = new A11yRecorder<FakeNode>(mirror);
    mirror.set(a, { role: "button", label: "A" });
    mirror.set(b, { role: "img", label: "B" });
    mirror.set(c, { role: "button", label: "C" });
    mirror.sync(root);
    return { mirror, rec, a, b, c };
  }

  it("focus(node) moves focus to a focusable mirror node; tab() and shift-tab walk the tab stops and then leave", () => {
    const { rec, a, c } = setup();
    expect(rec.focused).toBeNull();
    expect(rec.tab()).toBe(a);
    expect(rec.tab()).toBe(c); // b is not focusable
    expect(rec.tab()).toBeNull(); // leaves the canvas: never a trap
    expect(rec.focused).toBeNull();
    expect(rec.tab({ shift: true })).toBe(c);
    expect(rec.tab({ shift: true })).toBe(a);
    expect(rec.tab({ shift: true })).toBeNull();
    expect(rec.focus(c)).toBe(true);
    expect(rec.focused).toBe(c);
  });

  it("focus(node) refuses an untagged or non-focusable node", () => {
    const { rec, b } = setup();
    expect(rec.focus(b)).toBe(false);
    expect(rec.focus(new FakeNode())).toBe(false);
    expect(rec.focused).toBeNull();
  });

  it("with no mirror the host is the one tab stop", () => {
    const mirror = new A11yMirror<FakeNode>();
    const rec = new A11yRecorder<FakeNode>(mirror);
    expect(rec.tab()).toBe("host");
    expect(rec.tab()).toBeNull();
  });

  it("Enter and Space on the focused node (and click) activate it; Escape is not consumed", () => {
    const { rec, a, c } = setup();
    rec.focus(a);
    expect(rec.press("Enter")).toBe(true);
    expect(rec.press("Space")).toBe(true);
    expect(a.emitted.map((e) => e.name)).toEqual(["pointertap", "pointertap"]);
    expect(rec.press("Escape")).toBe(false);
    expect(rec.press("Tab")).toBe(false);
    expect(a.emitted).toHaveLength(2);
    expect(rec.click(c)).toBe(true);
    expect(c.emitted).toHaveLength(1);
  });

  it("losing the focused node (hidden) drops focus", () => {
    const { mirror, rec, a } = setup();
    rec.focus(a);
    a.visible = false;
    mirror.sync(a.parent!);
    expect(rec.focused).toBeNull();
  });
});

describe("DomA11ySink", () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
  });
  afterEach(() => document.body.replaceChildren());

  function entry(node: FakeNode, p: Partial<A11yEntry<FakeNode>> = {}): A11yEntry<FakeNode> {
    return { node, role: "button", label: "Go", description: undefined, focusable: true, order: 0, bounds: { x: 5, y: 6, width: 70, height: 20 }, ...p };
  }

  it("renders a real button with label, bounds, transparent paint and no pointer interception", () => {
    const activate = vi.fn();
    const sink = new DomA11ySink<FakeNode>(host, activate);
    sink.render([entry(new FakeNode())]);
    const el = host.querySelector("button")!;
    expect(el.getAttribute("aria-label")).toBe("Go");
    expect(el.hasAttribute("role")).toBe(false);
    expect(el.style.left).toBe("5px");
    expect(el.style.top).toBe("6px");
    expect(el.style.width).toBe("70px");
    expect(el.style.height).toBe("20px");
    expect(el.style.position).toBe("absolute");
    expect(el.style.pointerEvents).toBe("none");
    expect(el.style.opacity).toBe(""); // not opacity 0: the focus ring must stay visible
    expect(el.style.background).toBe("transparent");
    expect(el.tabIndex).toBe(0);
  });

  it("maps other roles to a div with that role, tabindex only when focusable, and a description", () => {
    const sink = new DomA11ySink<FakeNode>(host, vi.fn());
    sink.render([
      entry(new FakeNode(), { role: "img", label: "Hero", focusable: false, description: "A knight" }),
      entry(new FakeNode(), { role: "listitem", label: "Row", focusable: true }),
    ]);
    const [img, row] = [...host.querySelectorAll<HTMLElement>("[role]")];
    expect(img!.tagName).toBe("DIV");
    expect(img!.getAttribute("role")).toBe("img");
    expect(img!.hasAttribute("tabindex")).toBe(false);
    const described = img!.getAttribute("aria-describedby")!;
    expect(document.getElementById(described)!.textContent).toBe("A knight");
    expect(row!.getAttribute("tabindex")).toBe("0");
  });

  it("a non-focusable button is taken out of the tab order", () => {
    const sink = new DomA11ySink<FakeNode>(host, vi.fn());
    sink.render([entry(new FakeNode(), { focusable: false })]);
    expect(host.querySelector("button")!.tabIndex).toBe(-1);
  });

  it("keeps DOM order equal to entry order, reuses elements and removes the ones that disappear", () => {
    const sink = new DomA11ySink<FakeNode>(host, vi.fn());
    const [a, b] = [new FakeNode(), new FakeNode()];
    sink.render([entry(a, { label: "A" }), entry(b, { label: "B" })]);
    const first = host.querySelector("button")!;
    sink.render([entry(b, { label: "B" }), entry(a, { label: "A", bounds: { x: 0, y: 0, width: 1, height: 1 } })]);
    const labels = [...host.querySelectorAll("button")].map((e) => e.getAttribute("aria-label"));
    expect(labels).toEqual(["B", "A"]);
    expect(host.querySelectorAll("button")[1]).toBe(first);
    expect(first.style.width).toBe("1px");
    sink.render([entry(b, { label: "B" })]);
    expect(host.querySelectorAll("button")).toHaveLength(1);
  });

  it("click activates; Enter and Space activate a non-button and never anything else; Tab and Escape are untouched", () => {
    const activate = vi.fn();
    const sink = new DomA11ySink<FakeNode>(host, activate);
    const bt = new FakeNode();
    const li = new FakeNode();
    sink.render([entry(bt), entry(li, { role: "listitem" })]);
    const button = host.querySelector("button")!;
    const item = host.querySelector<HTMLElement>("[role=listitem]")!;
    button.click();
    expect(activate).toHaveBeenLastCalledWith(bt, expect.anything());
    activate.mockClear();

    const key = (el: HTMLElement, k: string, code = k) => {
      const e = new KeyboardEvent("keydown", { key: k, code, bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e;
    };
    const enter = key(item, "Enter");
    const space = key(item, " ", "Space");
    expect(activate).toHaveBeenCalledTimes(2);
    expect(enter.defaultPrevented).toBe(true);
    expect(space.defaultPrevented).toBe(true); // no page scroll
    const tab = key(item, "Tab");
    const esc = key(item, "Escape");
    const arrow = key(item, "ArrowDown");
    expect(activate).toHaveBeenCalledTimes(2);
    expect([tab, esc, arrow].map((e) => e.defaultPrevented)).toEqual([false, false, false]);
    // A native button gets Enter and Space as clicks from the browser; the sink must not double-handle keydown on it.
    key(button, "Enter");
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it("keeps the activation keys away from the host Keyboard service (stopPropagation), but lets Tab and Escape through", () => {
    const sink = new DomA11ySink<FakeNode>(host, vi.fn());
    sink.render([entry(new FakeNode()), entry(new FakeNode(), { role: "listitem" })]);
    const seen: string[] = [];
    host.addEventListener("keydown", (e) => seen.push((e as KeyboardEvent).key));
    host.addEventListener("keyup", (e) => seen.push("up:" + (e as KeyboardEvent).key));
    for (const el of [host.querySelector("button")!, host.querySelector<HTMLElement>("[role=listitem]")!]) {
      for (const [k, code] of [["Enter", "Enter"], [" ", "Space"], ["Tab", "Tab"], ["Escape", "Escape"]] as const) {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true, cancelable: true }));
        if (k === "Enter" || k === " ") el.dispatchEvent(new KeyboardEvent("keyup", { key: k, code, bubbles: true, cancelable: true }));
      }
    }
    expect(seen).toEqual(["Tab", "Escape", "Tab", "Escape"]);
  });

  it("reports the number of tab stops and removes its container on destroy", () => {
    const stops = vi.fn();
    const sink = new DomA11ySink<FakeNode>(host, vi.fn(), stops);
    sink.render([entry(new FakeNode()), entry(new FakeNode(), { focusable: false })]);
    expect(stops).toHaveBeenLastCalledWith(1);
    sink.destroy();
    expect(host.querySelector("[data-gable-a11y]")).toBeNull();
    expect(stops).toHaveBeenLastCalledWith(0);
  });
});

// ---- through the real renderer ----

function harness(extra: Partial<PixiRendererOptions> = {}) {
  const stage = new Container();
  const canvas = document.createElement("canvas");
  const app: ApplicationLike = {
    async init() {},
    canvas,
    stage,
    render() {},
    renderer: { resize() {} },
    destroy() {
      canvas.remove();
    },
  };
  let pending: ((time: number) => void) | null = null;
  const scheduler: FrameScheduler = {
    request(cb) {
      pending = cb;
      return 1;
    },
    cancel() {
      pending = null;
    },
  };
  let now = 1000;
  return {
    canvas,
    options: { createApplication: () => app, scheduler, ...extra } as PixiRendererOptions,
    frame(ms = 16) {
      now += ms;
      const cb = pending;
      expect(cb, "a frame was requested").not.toBeNull();
      pending = null;
      cb!(now);
    },
    get scheduled() {
      return pending !== null;
    },
    get host(): HTMLElement {
      return canvas.parentElement!;
    },
  };
}
type Harness = ReturnType<typeof harness>;

const live: Array<{ destroy(): void }> = [];
afterEach(() => {
  while (live.length) live.pop()!.destroy();
  document.body.replaceChildren();
});

async function mountScene(h: Harness, scene: ReturnType<typeof html>, setup: object = {}) {
  class Scene {
    static meta = { selector: "test-canvas", template: scene, renderer: pixiRenderer(h.options) };
  }
  Object.assign(Scene.prototype, setup);
  class Page {
    static meta = { selector: "app-page", template: html`<test-canvas></test-canvas>`, imports: [GableCanvas, Scene] };
  }
  const target = document.createElement("div");
  document.body.append(target);
  live.push(bootstrap(Page as never, { renderer: createDomRenderer(), target }));
  await vi.waitFor(() => expect(h.canvas.isConnected).toBe(true));
  await vi.waitFor(() => expect(h.scheduled).toBe(true));
}

describe("[a11y] in a scene", () => {
  it("builds a hidden mirror next to the canvas from tagged nodes, in scene order", async () => {
    const h = harness();
    const taps: string[] = [];
    await mountScene(h, html`
      <container [x]="10" [y]="20" [width]="40" [height]="30" [a11y]="startA11y" (pointertap)="tap('start')"></container>
      <container [a11y]="logoA11y"></container>
      <container></container>
    `, {
      startA11y: { role: "button", label: "Start" },
      logoA11y: { role: "img", label: "Logo", description: "The logo" },
      tap: (n: string) => taps.push(n),
    });
    h.frame();
    const mirror = h.host.querySelector("[data-gable-a11y]")!;
    expect(mirror).not.toBeNull();
    expect(mirror.parentElement).toBe(h.host);
    expect(mirror.children).toHaveLength(2);
    const [start, logo] = [...mirror.children] as HTMLElement[];
    expect(start!.tagName).toBe("BUTTON");
    expect(start!.getAttribute("aria-label")).toBe("Start");
    expect(logo!.getAttribute("role")).toBe("img");
    // click on the mirror fires the node's pointertap handler
    start!.click();
    expect(taps).toEqual(["start"]);
  });

  it("follows signal changes: label, visibility and removal", async () => {
    const h = harness();
    const label = signal("One");
    const shown = signal(true);
    await mountScene(h, html`@if (shown()) { <container [a11y]="props()"></container> }`, { props: computed(() => ({ role: "button", label: label() })), shown });
    h.frame();
    const q = () => h.host.querySelectorAll<HTMLElement>("[data-gable-a11y] > *");
    expect(q()[0]!.getAttribute("aria-label")).toBe("One");
    label.set("Two");
    flushSync();
    h.frame();
    expect(q()[0]!.getAttribute("aria-label")).toBe("Two");
    shown.set(false);
    flushSync();
    h.frame();
    expect(q()).toHaveLength(0);
  });

  it("makes the mirror elements the tab stops instead of the host, and gives the host back when there are none", async () => {
    const h = harness();
    const on = signal(true);
    await mountScene(h, html`@if (on()) { <container [a11y]="props"></container> }`, { props: { role: "button", label: "A" }, on });
    h.frame();
    expect(h.host.tabIndex).toBe(-1);
    on.set(false);
    flushSync();
    h.frame();
    expect(h.host.tabIndex).toBe(0);
  });

  it("never captures Tab or Escape on the host or the mirror", async () => {
    const h = harness();
    await mountScene(h, html`<container [a11y]="props"></container>`, { props: { role: "listitem", label: "A", focusable: true } });
    h.frame();
    const item = h.host.querySelector<HTMLElement>("[role=listitem]")!;
    for (const key of ["Tab", "Escape"]) {
      const e = new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true });
      item.dispatchEvent(e);
      expect(e.defaultPrevented, key).toBe(false);
    }
  });

  it("an unknown property shape is a clear error", () => {
    const r = createPixiRenderer();
    const node = r.createElement("container", null);
    expect(() => r.setProperty(node, "a11y", { role: "button" } as never)).toThrow(/label/);
    r.destroy();
  });

  it("destroying the scene removes the mirror", async () => {
    const h = harness();
    await mountScene(h, html`<container [a11y]="props"></container>`, { props: { role: "button", label: "A" } });
    h.frame();
    expect(h.host.querySelector("[data-gable-a11y]")).not.toBeNull();
    while (live.length) live.pop()!.destroy();
    expect(document.querySelector("[data-gable-a11y]")).toBeNull();
  });
});

describe("announceOnChange", () => {
  class Announcer extends LiveAnnouncer {
    messages: Array<{ message: string; politeness: Politeness }> = [];
    announce(message: string, politeness: Politeness = "polite") {
      this.messages.push({ message, politeness });
    }
    clear() {}
  }
  let announcer: Announcer;

  async function host(setup: () => void) {
    announcer = new Announcer();
    class Hud {
      static meta = { selector: "score-hud", template: html`<span></span>` };
      wired = (setup(), 0);
    }
    class Page {
      static meta = { selector: "app-page", template: html`<score-hud></score-hud>`, imports: [Hud] };
    }
    const target = document.createElement("div");
    document.body.append(target);
    const app = bootstrap(Page as never, { renderer: createDomRenderer(), target, providers: [{ provide: LiveAnnouncer, useValue: announcer }] } as never);
    live.push(app);
    flushSync();
    return app;
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("announces a change through the injected LiveAnnouncer, formatted, and not the initial value", async () => {
    const score = signal(0);
    await host(() => announceOnChange(score, (v) => `Score ${v}`));
    expect(announcer.messages).toEqual([]);
    score.set(10);
    flushSync();
    expect(announcer.messages).toEqual([{ message: "Score 10", politeness: "polite" }]);
  });

  it("throttles to one message per second: the burst's last value is spoken when the window ends", async () => {
    const score = signal(0);
    await host(() => announceOnChange(score, (v) => `Score ${v}`));
    score.set(1);
    flushSync();
    for (let i = 2; i <= 30; i++) {
      vi.advanceTimersByTime(20);
      score.set(i);
      flushSync();
    }
    expect(announcer.messages.map((m) => m.message)).toEqual(["Score 1"]);
    vi.advanceTimersByTime(1000);
    expect(announcer.messages.map((m) => m.message)).toEqual(["Score 1", "Score 30"]);
    vi.advanceTimersByTime(5000);
    expect(announcer.messages).toHaveLength(2); // nothing more pending
    score.set(31); // window long over: immediate
    flushSync();
    expect(announcer.messages.map((m) => m.message).at(-1)).toBe("Score 31");
  });

  it("supports assertive politeness, a custom interval and skipping a message with an empty format", async () => {
    const hp = signal(3);
    await host(() => announceOnChange(hp, (v) => (v > 1 ? "" : `Health ${v}`), { politeness: "assertive", intervalMs: 200 }));
    hp.set(2);
    flushSync();
    expect(announcer.messages).toEqual([]);
    hp.set(1);
    flushSync();
    expect(announcer.messages).toEqual([{ message: "Health 1", politeness: "assertive" }]);
  });

  it("stops when its scope ends: a pending message is dropped", async () => {
    const score = signal(0);
    const app = await host(() => announceOnChange(score, (v) => `Score ${v}`));
    score.set(1);
    flushSync();
    score.set(2);
    flushSync();
    app.destroy();
    vi.advanceTimersByTime(2000);
    expect(announcer.messages.map((m) => m.message)).toEqual(["Score 1"]);
  });
});

describe("ReducedMotion", () => {
  function media(initial: boolean) {
    const listeners = new Set<(e: { matches: boolean }) => void>();
    const mql = {
      matches: initial,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
    };
    return {
      matchMedia: vi.fn((_q: string) => mql),
      set(v: boolean) {
        mql.matches = v;
        for (const l of listeners) l({ matches: v });
      },
      listeners,
    };
  }

  it("reflects prefers-reduced-motion as a signal and follows changes", () => {
    const m = media(true);
    const rm = new ReducedMotion();
    const detach = rm.attach(m.matchMedia);
    expect(m.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(rm.reduced()).toBe(true);
    m.set(false);
    expect(rm.reduced()).toBe(false);
    detach();
    expect(m.listeners.size).toBe(0);
  });

  it("is false when there is no matchMedia", () => {
    const rm = new ReducedMotion();
    rm.attach(null);
    expect(rm.reduced()).toBe(false);
  });

  it("is provided at the canvas boundary, driven by the renderer's matchMedia option", () => {
    const m = media(true);
    const r = createPixiRenderer({ matchMedia: m.matchMedia });
    const provider = r.providers!.find((p) => (p as { provide: unknown }).provide === ReducedMotion) as { useValue: ReducedMotion };
    expect(provider.useValue.reduced()).toBe(true);
    r.destroy();
    expect(m.listeners.size).toBe(0);
  });
});
