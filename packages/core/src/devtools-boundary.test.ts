// Renderer boundaries in the devtools hook: a renderer registers a snapshot of its node tree and the hook reports it with
// source locations and the effects of the last flush (TASK-105.20). Driven here with DOM elements standing in for scene nodes.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync, html, signal } from "@gable/core";
import { mount, type TestNode } from "@gable/testing";
import { createDesigner, type DesignerInstance } from "@gable/core/designer";
import { createDevtools, type BoundarySpec, type BoundaryTree, type DevtoolsEvent, type DevtoolsInstance } from "@gable/core/devtools";

let dt: DevtoolsInstance;
let designer: DesignerInstance | null = null;
const target: { __GABLE_DEVTOOLS_HOOK__?: any; __GABLE_DESIGNER_HOOK__?: any } = {};
beforeEach(() => {
  dt = createDevtools(target);
  // Effect runs are recorded while a client is connected.
  dt.hook.connect(() => {});
});
afterEach(() => {
  dt.dispose();
  designer?.dispose();
  designer = null;
});

class Hud {
  static meta = { selector: "app-hud", template: html`<p>{{ n() }}</p>
<span [title]="t()">x</span>` };
  n = signal(1);
  t = signal("a");
}

/** A boundary over the elements of a mounted component: the tree is the DOM tree under the host. */
function spec(root: TestNode, label = "Test scene"): BoundarySpec {
  return {
    label,
    kind: "scene",
    snapshot() {
      const out: ReturnType<BoundarySpec["snapshot"]> = [];
      const walk = (el: TestNode, parent: TestNode | null) => {
        if (el.kind !== "element") return;
        out.push({ node: el, parent, name: el.tag!, tag: el.tag!, kind: "Element" });
        for (const c of el.children) walk(c, el);
      };
      walk(root, null);
      return out;
    },
  };
}

const tree = (id: string) => dt.hook.call("boundaryTree", { id }) as BoundaryTree | null;

describe("renderer boundaries", () => {
  it("lists registered boundaries and tells clients when one comes or goes", () => {
    const events: DevtoolsEvent[] = [];
    dt.hook.connect((e) => events.push(e));
    const f = mount(Hud);
    const handle = dt.hook.registerBoundary("scene-1", spec(f.root));
    expect(dt.hook.call("boundaries", undefined)).toEqual([{ id: "scene-1", label: "Test scene", kind: "scene" }]);
    expect(events).toContainEqual({ type: "boundaries" });
    events.length = 0;
    handle.dispose();
    expect(dt.hook.call("boundaries", undefined)).toEqual([]);
    expect(events).toContainEqual({ type: "boundaries" });
    expect(tree("scene-1")).toBeNull();
  });

  it("reports the node tree flat, parents first, with ids the parent field refers to", () => {
    const f = mount(Hud);
    dt.hook.registerBoundary("b", spec(f.root));
    const t = tree("b")!;
    expect(t).toMatchObject({ id: "b", label: "Test scene", kind: "scene" });
    const nodes = t.nodes;
    expect(nodes.map((n) => n.name)).toEqual(["app-hud", "p", "span"]);
    expect(nodes[0]!.parent).toBeNull();
    expect(nodes[1]!.parent).toBe(nodes[0]!.id);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(3);
    // JSON-safe: nothing but plain data crosses the hook.
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });

  it("names the owning component and where its class was defined", () => {
    const f = mount(Hud);
    dt.hook.registerBoundary("b", spec(f.root));
    const [root] = tree("b")!.nodes;
    expect(root!.component).toMatchObject({ name: "Hud" });
    expect(root!.component!.id).toBe(dt.hook.componentFor(f.root));
  });

  it("gives a template position when the designer hook knows the node", () => {
    designer = createDesigner(target);
    const f = mount(Hud);
    dt.hook.registerBoundary("b", spec(f.root));
    const nodes = tree("b")!.nodes;
    const span = nodes.find((n) => n.name === "span")!;
    // The span is on the second line of the template, so its position is line 2, column 1.
    expect(span.template).toMatchObject({ line: 2, column: 1 });
    expect(span.template!.end).toBeGreaterThan(span.template!.start);
  });

  it("attaches the effects of the last flush to the nodes they updated, with why-reports reachable by id", async () => {
    const f = mount(Hud);
    await Promise.resolve(); // the first runs close their own record
    dt.hook.registerBoundary("b", spec(f.root));
    const hud = f.instance;
    hud.t.set("b");
    flushSync();
    const nodes = tree("b")!.nodes;
    const span = nodes.find((n) => n.name === "span")!;
    const p = nodes.find((n) => n.name === "p")!;
    expect(span.effects).toHaveLength(1);
    expect(span.effects[0]!.causes?.[0]?.signal.name).toBeDefined();
    expect(p.effects).toEqual([]);
    const report = dt.hook.call("why", { id: span.effects[0]!.id }) as { nodes: unknown[] } | null;
    expect(report?.nodes).toHaveLength(1);
  });

  it("an effect of a first run is not an effect of the last flush when a later flush ran others", async () => {
    const f = mount(Hud);
    await Promise.resolve(); // the first runs close their own record
    dt.hook.registerBoundary("b", spec(f.root));
    const hud = f.instance;
    hud.t.set("b");
    flushSync();
    hud.n.set(2);
    flushSync();
    const nodes = tree("b")!.nodes;
    expect(nodes.find((n) => n.name === "span")!.effects).toEqual([]);
    expect(nodes.find((n) => n.name === "p")!.effects).toHaveLength(1);
  });

  it("places nodes on the page from the host's box and the boundary's own rects, and answers pageRectOf for any node", () => {
    const f = mount(Hud);
    const host = { getBoundingClientRect: () => ({ left: 100, top: 50 }) };
    dt.hook.registerBoundary("b", {
      ...spec(f.root),
      host,
      rectOf: (node) => (node === f.root ? { x: 0, y: 0, width: 300, height: 150 } : null),
    });
    const nodes = tree("b")!.nodes;
    expect(nodes[0]!.rect).toEqual({ x: 100, y: 50, width: 300, height: 150 });
    expect(nodes[1]!.rect).toBeNull();
    expect(dt.hook.pageRectOf(f.root)).toEqual({ x: 100, y: 50, width: 300, height: 150 });
    expect(dt.hook.pageRectOf({})).toBeNull();
    expect(dt.hook.pageRectOf(null)).toBeNull();
  });

  it("carries the designer id of the template node so a design tool can select it", () => {
    designer = createDesigner(target);
    const f = mount(Hud);
    dt.hook.registerBoundary("b", spec(f.root));
    const span = tree("b")!.nodes.find((n) => n.name === "span")!;
    expect(span.template!.id).toBe(designer.hook.nodeOf(f.query("span")!)!.id);
  });

  it("survives a snapshot that throws", () => {
    dt.hook.registerBoundary("bad", {
      label: "Bad",
      kind: "scene",
      snapshot() {
        throw new Error("destroyed");
      },
    });
    expect(() => tree("bad")).not.toThrow();
    expect(tree("bad")!.nodes).toEqual([]);
    expect(tree("bad")!.error).toMatch("destroyed");
  });
});
