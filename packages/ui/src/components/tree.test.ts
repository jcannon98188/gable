import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { UiTree, type TreeNode } from "./tree.js";

const BIG: TreeNode[] = Array.from({ length: 100 }, (_, f) => ({
  id: `d${f}`,
  label: `dir ${f}`,
  children: Array.from({ length: 100 }, (_, i) => ({ id: `d${f}/f${i}`, label: `file ${f}-${i}` })),
}));

class App {
  static meta = {
    selector: "app-root",
    imports: [UiTree],
    template: html`<ui-tree class="x-tree" label="Files" [nodes]="nodes" [(expanded)]="expanded" [(selected)]="selected" selectionMode="multiple" [virtual]="virtual" [itemSize]="20"></ui-tree>`,
  };
  nodes = BIG;
  expanded = signal<string[]>(BIG.map((n) => n.id));
  selected = signal<string[]>([]);
  virtual = true;
}

const key = (f: ReturnType<typeof mount>, el: Parameters<typeof f.dispatch>[0], k: string) => f.dispatch(el, "keydown", { key: k, target: el, preventDefault() {} });

describe("ui-tree (in memory)", () => {
  it("renders only a window of 10,100 nodes, with per-level aria", async () => {
    const t0 = performance.now();
    const f = mount(App);
    await f.settle();
    f.dispatch(f.query(".x-tree")!, "scroll", { target: { scrollTop: 20 * 5000, clientHeight: 200 } });
    await f.settle();
    const rows = f.queryAll("[role=treeitem]");
    expect(f.query(".x-tree")!.attrs).toMatchObject({ role: "tree", "aria-label": "Files", "aria-multiselectable": "true" });
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThan(40);
    const withLevel2 = rows.find((r) => r.attrs["aria-level"] === "2")!;
    expect(withLevel2.attrs["aria-setsize"]).toBe("100");
    expect(Number(withLevel2.attrs["aria-posinset"])).toBeGreaterThan(0);
    expect(rows.filter((r) => r.attrs.tabindex === "0").length).toBeLessThanOrEqual(1);
    expect(performance.now() - t0).toBeLessThan(5000);
  });

  it("selects by click and Space on the in-memory renderer", async () => {
    const f = mount(App);
    await f.settle();
    f.dispatch(f.query(".x-tree")!, "scroll", { target: { scrollTop: 0, clientHeight: 200 } });
    await f.settle();
    const rows = f.queryAll("[role=treeitem]");
    f.dispatch(rows[2]!, "click", {});
    key(f, rows[2]!, " ");
    f.dispatch(rows[3]!, "click", { ctrlKey: true });
    await f.settle();
    expect(f.instance.selected()).toEqual(["d0/f2"]);
    expect(f.query('[data-index="3"]')!.attrs["aria-selected"]).toBe("true");
  });
});
