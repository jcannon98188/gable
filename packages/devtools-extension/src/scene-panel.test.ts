// @vitest-environment jsdom
// The Scene panel (canvas/139): the display-object tree of a canvas boundary with source locations and the last flush's effects,
// read through the same devtools hook methods the other tabs use.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync, html, signal } from "@gablejs/core";
import { mount, type TestNode } from "@gablejs/testing";
import { createDesigner, type DesignerInstance } from "@gablejs/core/designer";
import { createDevtools, type BoundarySpec, type DevtoolsEvent, type DevtoolsInstance } from "@gablejs/core/devtools";
import type { Client, Status } from "./panel/client.js";
import { createPanel, TABS } from "./panel/model.js";
import { render } from "./panel/view.js";

let dt: DevtoolsInstance;
let designer: DesignerInstance | null = null;
const target: { __GABLE_DEVTOOLS_HOOK__?: any; __GABLE_DESIGNER_HOOK__?: any } = {};
beforeEach(() => {
  dt = createDevtools(target);
  dt.hook.connect(() => {});
});
afterEach(() => {
  dt.dispose();
  designer?.dispose();
  designer = null;
});

/** A client straight onto the hook, as the transport would deliver it. */
function directClient() {
  const events: Array<(e: DevtoolsEvent) => void> = [];
  dt.hook.connect((e) => events.forEach((l) => l(e)));
  const status: Status = { detected: true, version: 1 };
  const client: Client = {
    status,
    request: async (method, params) => dt.hook.call(method, params as never) as never,
    onEvent: (l) => void events.push(l),
    onStatus: () => {},
  };
  return client;
}

class Hud {
  static meta = { selector: "app-hud", template: html`<p>{{ n() }}</p>
<span [title]="t()">x</span>` };
  n = signal(1);
  t = signal("a");
}

function register(root: TestNode, extra: Partial<BoundarySpec> = {}) {
  return dt.hook.registerBoundary("scene-1", {
    label: "Game",
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
    ...extra,
  });
}

describe("Scene tab model", () => {
  it("is a tab of the panel", () => {
    expect(TABS.map((t) => t.id)).toContain("scene");
  });

  it("loads the boundary list and the first boundary's tree when the tab opens", async () => {
    const f = mount(Hud);
    register(f.root);
    const panel = createPanel(directClient(), { evalInPage: async () => null });
    await panel.setTab("scene");
    expect(panel.state.boundaries).toEqual([{ id: "scene-1", label: "Game", kind: "scene" }]);
    expect(panel.state.boundary).toBe("scene-1");
    expect(panel.state.scene!.nodes.map((n) => n.name)).toEqual(["app-hud", "p", "span"]);
  });

  it("follows a boundary that appears later, from the boundaries event", async () => {
    const panel = createPanel(directClient(), { evalInPage: async () => null });
    await panel.setTab("scene");
    expect(panel.state.boundaries).toEqual([]);
    register(mount(Hud).root);
    await new Promise((r) => setTimeout(r, 0));
    expect(panel.state.boundaries).toHaveLength(1);
    expect(panel.state.scene?.nodes.length).toBeGreaterThan(0);
  });

  it("selecting a node shows its source location and its effects from the last flush, and explains one", async () => {
    designer = createDesigner(target);
    const f = mount(Hud);
    await Promise.resolve();
    register(f.root);
    const panel = createPanel(directClient(), { evalInPage: async () => null });
    await panel.setTab("scene");
    f.instance.t.set("b");
    flushSync();
    await panel.refresh();
    const span = panel.state.scene!.nodes.find((n) => n.name === "span")!;
    await panel.selectSceneNode(span.id);
    expect(panel.state.sceneSelected).toBe(span.id);
    expect(span.template).toMatchObject({ line: 2, column: 1 });
    expect(span.effects).toHaveLength(1);
    await panel.explainEffect(span.effects[0]!.id);
    expect(panel.state.why?.nodes[0]!.binding).toMatchObject({ what: "prop:title" });
    expect(panel.state.why?.nodes[0]!.recent.at(-1)!.causes).toHaveLength(1);
  });

  it("opens the owning component's source in the editor", async () => {
    const f = mount(Hud);
    register(f.root);
    const panel = createPanel(directClient(), { evalInPage: async () => null });
    await panel.setTab("scene");
    await panel.selectSceneNode(panel.state.scene!.nodes[0]!.id);
    await panel.openSceneSource();
    // No dev server in a test: the hook says so, and the panel shows it.
    expect(panel.state.message?.kind).toBe("error");
  });

  it("an unregistered boundary leaves the tab empty without an error", async () => {
    const f = mount(Hud);
    const handle = register(f.root);
    const panel = createPanel(directClient(), { evalInPage: async () => null });
    await panel.setTab("scene");
    handle.dispose();
    await panel.refresh();
    expect(panel.state.boundary).toBeNull();
    expect(panel.state.scene).toBeNull();
    expect(panel.state.message).toBeNull();
  });
});

describe("Scene tab view", () => {
  it("renders the tree with tags, kinds, source and the effects of the last flush", async () => {
    designer = createDesigner(target);
    const f = mount(Hud);
    await Promise.resolve();
    register(f.root);
    const panel = createPanel(directClient(), { evalInPage: async () => null });
    await panel.setTab("scene");
    f.instance.t.set("b");
    flushSync();
    await panel.refresh();
    const root = document.createElement("div");
    render(root, panel);
    const rows = [...root.querySelectorAll("[data-scene-node]")];
    expect(rows.map((r) => r.querySelector(".cname")!.textContent)).toEqual(["app-hud", "p", "span"]);
    const span = rows[2] as HTMLElement;
    expect(span.textContent).toContain("1 effect");
    await panel.selectSceneNode(span.dataset.sceneNode!);
    render(root, panel);
    const detail = root.querySelector(".scene-detail")!.textContent!;
    expect(detail).toContain("template 2:1");
    expect(detail).toContain("prop:title");
    expect(detail).toContain("Hud");
  });

  it("says what to do when no canvas has registered", async () => {
    const panel = createPanel(directClient(), { evalInPage: async () => null });
    await panel.setTab("scene");
    const root = document.createElement("div");
    render(root, panel);
    expect(root.textContent).toContain("No canvas scene");
  });
});
