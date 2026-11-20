// The Designer reports a canvas boundary's scene like a DOM tree (canvas/139): nested nodes with their owner, source, template
// position and page box, built from the devtools hook's boundary trees.
import { describe, expect, it } from "vitest";
import { createDevtools, type BoundaryInfo, type BoundaryNode, type BoundaryTree } from "@gable/core/devtools";
import { pageRectFor, sceneReport } from "./agent/scene.js";

const node = (id: string, parent: string | null, name: string, extra: Partial<BoundaryNode> = {}): BoundaryNode => ({
  id,
  parent,
  name,
  tag: name,
  kind: "Container",
  component: null,
  source: null,
  template: null,
  rect: null,
  effects: [],
  ...extra,
});

const tree = (nodes: BoundaryNode[], extra: Partial<BoundaryTree> = {}): BoundaryTree => ({ id: "scene-1", label: "Game", kind: "scene", nodes, flush: null, ...extra });

describe("sceneReport", () => {
  it("nests the flat node list the way a DOM tree nests", () => {
    const report = sceneReport([tree([node("n1", null, "stage"), node("n2", "n1", "hud"), node("n3", "n2", "text"), node("n4", "n1", "ship")])]);
    expect(report).toHaveLength(1);
    const root = report[0]!.root!;
    expect(root.name).toBe("stage");
    expect(root.children.map((c) => c.name)).toEqual(["hud", "ship"]);
    expect(root.children[0]!.children.map((c) => c.name)).toEqual(["text"]);
  });

  it("carries owner, source, template position, box and the number of effects of the last flush", () => {
    const report = sceneReport([
      tree([
        node("n1", null, "sprite", {
          component: { id: "c1", name: "Hud" },
          source: { path: "src/hud.ts", line: 3, column: 1 } as never,
          template: { id: "t1", line: 2, column: 1, start: 10, end: 20 },
          rect: { x: 1, y: 2, width: 30, height: 40 },
          effects: [{ id: "e1" } as never],
        }),
      ]),
    ]);
    expect(report[0]!.root).toMatchObject({
      component: "Hud",
      source: { path: "src/hud.ts" },
      template: { id: "t1", line: 2, column: 1 },
      rect: { x: 1, y: 2, width: 30, height: 40 },
      effects: 1,
    });
  });

  it("reports a boundary whose snapshot threw with its error and no root", () => {
    const report = sceneReport([tree([], { error: "boom" })]);
    expect(report[0]).toMatchObject({ id: "scene-1", label: "Game", error: "boom", root: null });
  });

  it("counts nodes", () => {
    expect(sceneReport([tree([node("n1", null, "a"), node("n2", "n1", "b")])])[0]!.count).toBe(2);
  });
});

describe("sceneReport over the real hook", () => {
  it("reports a registered boundary like a DOM tree, with page boxes from the boundary", () => {
    const target: { __GABLE_DEVTOOLS_HOOK__?: any } = {};
    const dt = createDevtools(target);
    const root = {};
    const child = {};
    dt.hook.registerBoundary("scene-1", {
      label: "Game",
      kind: "scene",
      snapshot: () => [
        { node: root, parent: null, name: "stage", tag: "stage", kind: "Container" },
        { node: child, parent: root, name: "ship", tag: "ship", kind: "Sprite" },
      ],
      host: { getBoundingClientRect: () => ({ left: 100, top: 200 }) },
      rectOf: (n) => (n === child ? { x: 4, y: 5, width: 6, height: 7 } : null),
    });
    const infos = dt.hook.call("boundaries", undefined as never) as BoundaryInfo[];
    const trees = infos.map((b) => dt.hook.call("boundaryTree", { id: b.id } as never) as BoundaryTree);
    const report = sceneReport(trees);
    expect(report[0]!.root!.children[0]).toMatchObject({ name: "ship", kind: "Sprite", rect: { x: 104, y: 205, width: 6, height: 7 } });
    expect(dt.hook.pageRectOf(child)).toEqual({ x: 104, y: 205, width: 6, height: 7 });
    dt.dispose();
  });
});

describe("pageRectFor", () => {
  it("turns a hook box into a DOMRect-like box", () => {
    expect(pageRectFor({ x: 5, y: 6, width: 7, height: 8 })).toMatchObject({ left: 5, top: 6, right: 12, bottom: 14, width: 7, height: 8 });
  });
});
