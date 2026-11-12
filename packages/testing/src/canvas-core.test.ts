import { describe, expect, it } from "vitest";
import { InjectionToken, RENDERER, effect, flushSync, html, inject, onCleanup, signal, whenFlushed, hotData } from "@gable/core";
import type { Renderer } from "@gable/core/renderer";
import { mount } from "@gable/testing";
import { createTestRenderer, createTestRoot, serialize, type TestNode, type TestRenderer } from "@gable/testing/renderer";

// A second renderer for a boundary: it records what it was asked to create and whether it was destroyed.
function secondRenderer(extra: Partial<Renderer<TestNode>> = {}) {
  const inner = createTestRenderer();
  const created: string[] = [];
  let destroyed = 0;
  const renderer: TestRenderer = {
    ...inner,
    name: "second",
    createElement(tag, parent) {
      created.push(tag);
      return inner.createElement(tag, parent);
    },
    destroy() {
      destroyed++;
    },
    ...extra,
  } as TestRenderer;
  return { renderer, root: createTestRoot(), created, destroyed: () => destroyed };
}

describe("renderer boundary (meta.renderer)", () => {
  it("builds the template into the boundary's root with the boundary renderer; the host stays in the parent renderer", () => {
    const second = secondRenderer();
    class Scene {
      static meta = { selector: "app-scene", template: html`<gnode></gnode>`, renderer: () => ({ renderer: second.renderer, root: second.root }) };
    }
    class App {
      static meta = { selector: "app-root", imports: [Scene], template: html`<p></p><app-scene></app-scene>` };
    }
    const f = mount(App);
    expect(f.query("app-scene")).not.toBeNull();
    expect(f.query("gnode")).toBeNull();
    expect(serialize(second.root)).toContain("gnode");
    expect(second.created).toEqual(["gnode"]);
  });

  it("builds projected slot content with the boundary renderer", () => {
    const second = secondRenderer();
    class Scene {
      static meta = { selector: "app-scene", template: html`<slot></slot>`, renderer: () => ({ renderer: second.renderer, root: second.root }) };
    }
    class App {
      static meta = { selector: "app-root", imports: [Scene], template: html`<app-scene><sprite></sprite></app-scene>` };
    }
    const f = mount(App);
    expect(f.query("sprite")).toBeNull();
    expect(second.created).toEqual(["sprite"]);
  });

  it("shares the host's injector and scope, shadows RENDERER and layers the boundary renderer's providers", async () => {
    const SHARED = new InjectionToken<{ n: ReturnType<typeof signal<number>> }>("shared");
    const SECOND = new InjectionToken<string>("second");
    const second = secondRenderer({ providers: [{ provide: SECOND, useValue: "from-second" }] });
    const seen: { renderer?: unknown; shared?: unknown; second?: unknown; hostSecond?: unknown } = {};
    class Inner {
      static meta = { selector: "app-inner", template: html`<i>{{ n() }}</i>` };
      shared = inject(SHARED)!;
      n = this.shared.n;
      _ = (seen.renderer = inject(RENDERER), seen.shared = this.shared, seen.second = inject(SECOND, { optional: true }));
    }
    class Scene {
      static meta = { selector: "app-scene", imports: [Inner], template: html`<app-inner></app-inner>`, renderer: () => ({ renderer: second.renderer, root: second.root }) };
      hostSeesSecond = (seen.hostSecond = inject(SECOND, { optional: true }));
    }
    class App {
      static meta = { selector: "app-root", imports: [Scene], template: html`<app-scene></app-scene>` };
    }
    const shared = { n: signal(1) };
    const f = mount(App, { providers: [{ provide: SHARED, useValue: shared }] });
    expect(seen.renderer).toBe(second.renderer);
    expect(seen.shared).toBe(shared);
    expect(seen.second).toBe("from-second");
    expect(seen.hostSecond ?? null).toBeNull();
    expect(serialize(second.root)).toContain("1");
    shared.n.set(2);
    await f.flush();
    expect(serialize(second.root)).toContain("2");
  });

  it("calls Renderer.destroy when the boundary host is destroyed, not before; a renderer without destroy is fine", () => {
    const second = secondRenderer();
    class Scene {
      static meta = { selector: "app-scene", template: html`<b></b>`, renderer: () => ({ renderer: second.renderer, root: second.root }) };
    }
    class App {
      static meta = { selector: "app-root", imports: [Scene], template: html`<app-scene></app-scene>` };
    }
    const f = mount(App);
    expect(second.destroyed()).toBe(0);
    f.destroy();
    expect(second.destroyed()).toBe(1);

    const plain = secondRenderer({ destroy: undefined });
    class Scene2 {
      static meta = { selector: "app-scene", template: html`<b></b>`, renderer: () => ({ renderer: plain.renderer, root: plain.root }) };
    }
    class App2 {
      static meta = { selector: "app-root", imports: [Scene2], template: html`<app-scene></app-scene>` };
    }
    const g = mount(App2);
    expect(() => g.destroy()).not.toThrow();
  });
});

describe("onCleanup", () => {
  it("runs when the calling component's scope is disposed", () => {
    const log: string[] = [];
    class C {
      static meta = { selector: "app-c", template: html`<b></b>` };
      _ = onCleanup(() => log.push("cleaned"));
    }
    const f = mount(C);
    expect(log).toEqual([]);
    f.destroy();
    expect(log).toEqual(["cleaned"]);
  });

  it("throws outside a scope", () => {
    expect(() => onCleanup(() => {})).toThrow(/outside a scope/);
  });
});

describe("public flush", () => {
  it("flushSync runs pending effects synchronously and whenFlushed resolves after", async () => {
    const s = signal(0);
    const seen: number[] = [];
    class C {
      static meta = { selector: "app-c", template: html`` };
      _ = effect(() => void seen.push(s()));
    }
    mount(C);
    s.set(1);
    expect(seen).toEqual([0]);
    flushSync();
    expect(seen).toEqual([0, 1]);
    s.set(2);
    await whenFlushed();
    expect(seen).toEqual([0, 1, 2]);
  });
});

describe("hotData", () => {
  it("calls create once per instance in a component field initialiser and returns the value", () => {
    let calls = 0;
    class C {
      static meta = { selector: "app-c", template: html`` };
      resource = hotData("app", () => ({ id: ++calls }));
    }
    const f = mount(C);
    expect(f.instance.resource).toEqual({ id: 1 });
    expect(calls).toBe(1);
  });

  it("returns the stored value when the component is re-set-up by a hot update, without calling create again", () => {
    let calls = 0;
    const version = () =>
      new Function("html", "hotData", "count", `return class Host { static meta = { selector: "app-host", template: html(["<b></b>"]) }; resource = hotData("app", () => count()); };`)(
        (s: string[]) => ({ strings: Object.assign([...s], { raw: [...s] }), values: [] }),
        hotData,
        () => ({ id: ++calls }),
      ) as { new (): { resource: { id: number } }; meta: { selector: string } };
    const f = mount(version());
    const first = f.instance.resource;
    f.hotReplace(version());
    expect(calls).toBe(1);
    expect(f.instance.resource).toBe(first);
  });

  it("keeps separate values for separate keys and for separate instances", () => {
    const seen: Array<{ a: object; b: object }> = [];
    class Leaf {
      static meta = { selector: "app-leaf", template: html`` };
      a = hotData("a", () => ({}));
      b = hotData("b", () => ({}));
      _ = seen.push(this as never);
    }
    class Parent {
      static meta = { selector: "app-parent", imports: [Leaf], template: html`<app-leaf></app-leaf><app-leaf></app-leaf>` };
    }
    const f = mount(Parent);
    expect(f.queryAll("app-leaf").length).toBe(2);
    expect(seen[0]!.a).not.toBe(seen[0]!.b);
    expect(seen[0]!.a).not.toBe(seen[1]!.a);
  });

  it("only calls create in production (dev hooks gate)", () => {
    // Production is `__GABLE_DEV__ === false`, which tree-shakes the store; the contract here is that create always runs
    // when there is no hot-update runtime to pair instances.
    let calls = 0;
    class C {
      static meta = { selector: "app-c", template: html`` };
      v = hotData("k", () => ++calls);
    }
    mount(C);
    mount(C);
    expect(calls).toBe(2);
  });

  it("throws outside a component Setup", () => {
    expect(() => hotData("k", () => 1)).toThrow(/outside a component Setup/);
  });
});
