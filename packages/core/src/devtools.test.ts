import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InjectionToken, computed, effect, html, inject, input, model, output, signal } from "@gable/core";
import { RouterOutlet, type Route } from "@gable/core/router";
import { applyUpdate, registerModule } from "@gable/core/hmr";
import { mount, mountApp } from "@gable/testing";
import { createDevtools, parseEdit, preview, type DevtoolsEvent, type DevtoolsInstance } from "@gable/core/devtools";

let dt: DevtoolsInstance;
const target: { __GABLE_DEVTOOLS_HOOK__?: any } = {};
beforeEach(() => {
  dt = createDevtools(target);
});
afterEach(() => dt.dispose());

const call = <T>(method: string, params?: unknown) => dt.hook.call(method as any, params as any) as T;
const find = <T extends { name: string }>(list: T[], name: string): T => list.find((x) => x.name === name)!;
const idOfRoot = (f: { root: unknown }) => dt.hook.componentFor(f.root)!;

class Child {
  static meta = { selector: "app-child", template: html`<b>{{ label() }}</b>` };
  label = input("none");
  needed = input.required<string>();
  on = model(false);
  picked = output<string>();
}
class Counter {
  static meta = {
    selector: "app-counter",
    imports: [Child],
    template: html`<p>{{ doubled() }}</p><app-child [label]="tag()" [needed]="'n'"></app-child>`,
  };
  count = signal(1);
  doubled = computed(() => this.count() * 2);
  tag = computed(() => "x" + this.count());
  _log = effect(() => void this.count());
}

describe("component tree", () => {
  it("lists components with parents, selectors and hosts", () => {
    mount(Counter);
    const tree = call<any[]>("tree");
    expect(tree.map((n) => n.name)).toEqual(["Counter", "Child"]);
    expect(tree[1]).toMatchObject({ parent: tree[0].id, selector: "app-child", host: "app-child" });
    expect(tree[0].parent).toBeNull();
  });

  it("drops a destroyed component and tells connected clients", async () => {
    const events: DevtoolsEvent[] = [];
    dt.hook.connect((e) => events.push(e));
    const f = mount(Counter);
    await Promise.resolve();
    expect(events.some((e) => e.type === "tree")).toBe(true);
    events.length = 0;
    f.destroy();
    await Promise.resolve();
    expect(call<any[]>("tree")).toEqual([]);
    expect(events).toContainEqual({ type: "tree" });
  });

  it("resolves a host node to its component and back", () => {
    const f = mount(Counter);
    const id = idOfRoot(f);
    expect(call<any>("component", { id }).name).toBe("Counter");
    expect(dt.hook.element(id)).toBe(f.root);
    const child = f.query("app-child")!;
    expect(call<any>("component", { id: dt.hook.componentFor(child)! }).name).toBe("Child");
  });
});

describe("component detail", () => {
  it("shows inputs, signals and computeds with current values", async () => {
    const f = mount(Counter);
    await f.flush();
    const detail = call<any>("component", { id: idOfRoot(f) });
    expect(find(detail.signals, "count")).toMatchObject({ kind: "state", writable: true, value: { t: "number", s: "1" } });
    expect(find(detail.signals, "doubled")).toMatchObject({ kind: "computed", writable: false, value: { s: "2" } });
    const child = call<any>("component", { id: dt.hook.componentFor(f.query("app-child")!)! });
    expect(find(child.inputs, "label")).toMatchObject({ kind: "input", value: { s: '"x1"' } });
    expect(find(child.inputs, "on").kind).toBe("model");
    expect(child.signals).toEqual([]);
    expect(child.outputs).toEqual(["picked"]);
  });

  it("reports an unset required input without throwing", () => {
    const f = mount(Child);
    const detail = call<any>("component", { id: idOfRoot(f) });
    expect(find(detail.inputs, "needed").value.t).toBe("unset");
    f.claimErrors();
  });

  it("exposes dependency edges in both directions", async () => {
    const f = mount(Counter);
    await f.flush();
    const detail = call<any>("component", { id: idOfRoot(f) });
    const count = find<any>(detail.signals, "count");
    const doubled = find<any>(detail.signals, "doubled");
    expect(doubled.sources.map((e: any) => e.name)).toEqual(["count"]);
    expect(count.sinks.map((e: any) => e.name)).toContain("doubled");
    expect(count.owner.name).toBe("Counter");
    // The user effect and the template bindings are effects of the component.
    expect(detail.effects.length).toBeGreaterThanOrEqual(2);
    expect(detail.effects.some((e: any) => e.sources.some((s: any) => s.name === "count"))).toBe(true);
    expect(count.sinks.some((e: any) => e.kind === "effect")).toBe(true);
  });
});

describe("editing", () => {
  it("writes a signal and the view follows after a flush", async () => {
    const f = mount(Counter);
    const count = find<any>(call<any>("component", { id: idOfRoot(f) }).signals, "count");
    expect(call("setSignal", { id: count.id, text: "21" })).toEqual({ ok: true });
    await f.flush();
    expect(f.text()).toContain("42");
    expect(call<any>("signal", { id: count.id }).value.s).toBe("21");
  });

  it("writes a model through its setter so the changes output fires", () => {
    const f = mount(Child);
    f.claimErrors();
    const detail = call<any>("component", { id: idOfRoot(f) });
    const seen: boolean[] = [];
    f.instance.on.changes.subscribe((v) => seen.push(v));
    expect(call("setSignal", { id: find<any>(detail.inputs, "on").id, text: "true" })).toEqual({ ok: true });
    expect(seen).toEqual([true]);
  });

  it("rejects a computed, bad JSON and unknown ids", () => {
    const f = mount(Counter);
    const detail = call<any>("component", { id: idOfRoot(f) });
    expect(call<any>("setSignal", { id: find<any>(detail.signals, "doubled").id, text: "1" }).ok).toBe(false);
    expect(call<any>("setSignal", { id: find<any>(detail.signals, "count").id, text: "{oops" }).error).toMatch(/Not valid JSON/);
    expect(call<any>("setSignal", { id: "s99999", text: "1" }).ok).toBe(false);
  });

  it("parses edits", () => {
    expect(parseEdit("undefined")).toEqual({ ok: true, value: undefined });
    expect(parseEdit('{"a":[1]}')).toEqual({ ok: true, value: { a: [1] } });
    expect(parseEdit("nope").ok).toBe(false);
  });
});

describe("effect log", () => {
  it("measures flushes only while a client is connected", async () => {
    const f = mount(Counter);
    f.instance.count.set(2);
    await f.flush();
    expect(call<any[]>("effectLog")).toEqual([]);
    const events: DevtoolsEvent[] = [];
    const off = dt.hook.connect((e) => events.push(e));
    f.instance.count.set(3);
    await f.flush();
    const flush = call<any[]>("effectLog").find((l) => l.kind === "flush")!;
    expect(flush.runs.length).toBeGreaterThanOrEqual(2);
    expect(flush.runs.every((r: any) => ["Counter", "Child"].includes(r.component) && typeof r.ms === "number")).toBe(true);
    expect(flush.ms).toBeGreaterThanOrEqual(0);
    expect(events).toContainEqual({ type: "flush", flush });
    expect(call("clearEffectLog")).toBe(true);
    expect(call<any[]>("effectLog")).toEqual([]);
    off();
  });

  it("counts runs per effect", async () => {
    const f = mount(Counter);
    dt.hook.connect(() => {});
    f.instance.count.set(5);
    await f.flush();
    const detail = call<any>("component", { id: idOfRoot(f) });
    expect(detail.effects.some((e: any) => e.runs >= 1 && e.totalMs >= 0)).toBe(true);
  });
});

describe("injectors", () => {
  class Cart {
    items = signal(["a"]);
    total = computed(() => this.items().length);
  }
  class Shop {
    static meta = { selector: "app-shop", providers: [Cart], template: html`<p>{{ cart.total() }}</p>` };
    cart = inject(Cart);
  }

  it("lists the injector tree with the component that owns each and the resolved services", () => {
    const f = mount(Shop);
    const nodes = call<any[]>("injectors");
    const own = nodes.find((n) => n.component?.name === "Shop")!;
    expect(own.parent).toBeTruthy();
    expect(nodes.some((n) => n.id === own.parent)).toBe(true);
    const cart = call<any>("injector", { id: own.id }).entries.find((e: any) => e.name === "Cart");
    expect(cart).toMatchObject({ kind: "class", resolved: true, provider: { kind: "class", target: "Cart" } });
    expect(cart.signals.map((s: any) => s.name).sort()).toEqual(["items", "total"]);
    expect(call<any>("component", { id: idOfRoot(f) }).injector).toBe(own.id);
  });

  it("shows the Provider behind each Token", () => {
    class Api {
      base = "real";
    }
    class FakeApi {
      base = "fake";
    }
    const PORT = new InjectionToken<number>("Port");
    class Page {
      static meta = {
        selector: "app-page",
        providers: [Cart, { provide: Api, useClass: FakeApi }, { provide: PORT, useValue: 8080 }, { provide: Shop, useExisting: Cart }],
        template: html`<p></p>`,
      };
    }
    mount(Page);
    const own = call<any[]>("injectors").find((n) => n.component?.name === "Page")!;
    const providers = Object.fromEntries(call<any>("injector", { id: own.id }).entries.map((e: any) => [e.name, e.provider]));
    expect(providers.Cart).toEqual({ kind: "class", target: "Cart" });
    expect(providers.Api).toEqual({ kind: "class", target: "FakeApi" });
    expect(providers['InjectionToken(Port)']).toEqual({ kind: "value", target: "8080" });
    expect(providers.Shop).toEqual({ kind: "existing", target: "Cart" });
  });

  it("drops destroyed injectors", () => {
    const f = mount(Shop);
    const before = call<any[]>("injectors").length;
    f.destroy();
    expect(call<any[]>("injectors").length).toBeLessThan(before);
  });
});

describe("router", () => {
  class Home {
    static meta = { selector: "app-home", template: html`<h1>Home</h1>` };
  }
  class About {
    static meta = { selector: "app-about", template: html`<h1>About</h1>` };
  }
  class Root {
    static meta = { selector: "app-root", imports: [RouterOutlet], template: html`<router-outlet></router-outlet>` };
  }
  const routes: Route[] = [
    { path: "", component: Home },
    { path: "about", component: About, title: "About" },
    { path: "old", redirectTo: "/about" },
  ];

  it("reports url, the route tree with the active chain, and navigation events", async () => {
    const app = mountApp(Root, { routes, url: "/" });
    await app.settle();
    const [router] = call<any[]>("routers");
    expect(router.url).toBe("/");
    expect(router.routes.map((r: any) => [r.path, r.component, r.active])).toEqual([
      ["", "Home", true],
      ["about", "About", false],
      ["old", null, false],
    ]);
    expect(router.routes[2].redirectTo).toBe("/about");
    expect(await call<any>("navigate", { id: router.id, url: "/about" })).toEqual({ ok: true });
    await app.settle();
    const after = call<any[]>("routers")[0];
    expect(after.url).toBe("/about");
    expect(after.routes[1].active).toBe(true);
    expect(after.events.map((e: any) => e.type)).toEqual(expect.arrayContaining(["start", "end"]));
  });

  it("streams navigation events to clients", async () => {
    const events: DevtoolsEvent[] = [];
    dt.hook.connect((e) => events.push(e));
    const app = mountApp(Root, { routes, url: "/" });
    await app.settle();
    await app.navigate("/about");
    expect(events.filter((e) => e.type === "router").length).toBeGreaterThanOrEqual(2);
  });
});

describe("hmr and source", () => {
  it("resolves a component's source from the module registration and logs updates", () => {
    class Page {
      static meta = { selector: "app-page", template: html`<p>v1</p>` };
    }
    registerModule("http://localhost:5173/src/page.ts?t=1", { Page });
    globalThis.__GABLE_DEV_SERVER__ = { root: "C:/proj" };
    try {
      const f = mount(Page);
      const detail = call<any>("component", { id: idOfRoot(f) });
      expect(detail.source).toEqual({ path: "/src/page.ts", file: "C:/proj/src/page.ts" });
      const events: DevtoolsEvent[] = [];
      dt.hook.connect((e) => events.push(e));
      applyUpdate([{ url: "http://localhost:5173/src/page.ts?t=2", exports: { Page } }]);
      const log = call<any[]>("hmrLog");
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ modules: ["http://localhost:5173/src/page.ts"], changes: [] });
      expect(events.some((e) => e.type === "hmr")).toBe(true);
    } finally {
      delete globalThis.__GABLE_DEV_SERVER__;
    }
  });

  it("tells whether an edit patched, rebuilt the view or re-ran the setup", () => {
    // Each version is a class of the same name, as a re-evaluated module would export.
    const V1 = (() => class Page {
      static meta = { selector: "app-page", template: html`<p>v1</p>` };
      n = signal(1);
      hello() {
        return "a";
      }
    })();
    const V2 = (() => class Page {
      static meta = { selector: "app-page", template: html`<p>v1</p>` };
      n = signal(1);
      hello() {
        return "b";
      }
    })();
    const V3 = (() => class Page {
      static meta = { selector: "app-page", template: html`<p>v2</p>` };
      n = signal(1);
      hello() {
        return "b";
      }
    })();
    const V4 = (() => class Page {
      static meta = { selector: "app-page", template: html`<p>v2</p>` };
      n = signal(2);
      hello() {
        return "b";
      }
    })();
    const url = "http://localhost:5173/src/kinds.ts";
    registerModule(url, { Page: V1 });
    mount(V1);
    const kind = (Class: Function) => {
      applyUpdate([{ url, exports: { Page: Class } }]);
      return call<any[]>("hmrLog").at(-1).changes;
    };
    expect(kind(V2)).toEqual([{ name: "Page", kind: "patch" }]);
    expect(kind(V3)).toEqual([{ name: "Page", kind: "view" }]);
    expect(kind(V4)).toEqual([{ name: "Page", kind: "resetup" }]);
  });

  it("says why it cannot open a file", async () => {
    const f = mount(Counter);
    const r = await call<any>("openInEditor", { id: idOfRoot(f) });
    expect(r.ok).toBe(false);
  });
});

describe("inspectors (store plug-in point)", () => {
  it("shows a registered snapshot and its history", () => {
    const state = { count: 1 };
    const handle = dt.hook.registerInspector("store:Counter", { label: "CounterStore", snapshot: () => state });
    handle.log("increment", { by: 1 });
    const [i] = call<any[]>("inspectors");
    expect(i.label).toBe("CounterStore");
    expect(i.snapshot.children[0]).toEqual(["count", { t: "number", s: "1" }]);
    expect(i.log[0]).toMatchObject({ type: "increment" });
    handle.dispose();
    expect(call<any[]>("inspectors")).toEqual([]);
  });
});

describe("preview", () => {
  it("is JSON-safe, bounded and handles cycles and odd values", () => {
    const cyc: any = { a: 1 };
    cyc.self = cyc;
    const big = Array.from({ length: 100 }, (_, i) => i);
    const p = preview({ cyc, big, fn() {}, u: undefined, d: new Date(0), m: new Map([["k", 1]]), e: new Error("x"), sym: Symbol("q") });
    expect(() => JSON.stringify(p)).not.toThrow();
    const kids = Object.fromEntries(p.children!);
    expect(kids.cyc!.children!.find(([k]) => k === "self")![1].s).toBe("[Circular]");
    expect(kids.big!.children).toHaveLength(20);
    expect(kids.big!.more).toBe(80);
    expect(kids.fn!.s).toContain("fn");
    expect(kids.e!.s).toBe("Error: x");
    expect(kids.m!.s).toBe("Map(1)");
  });
});
