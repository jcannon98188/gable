// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiTree, expandableIds, flattenTree, type TreeNode } from "./tree.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const TREE: TreeNode[] = [
  {
    id: "src",
    label: "src",
    children: [
      { id: "src/app", label: "app", children: [{ id: "src/app/main.ts", label: "main.ts" }, { id: "src/app/util.ts", label: "util.ts" }] },
      { id: "src/lib", label: "lib", disabled: true, children: [{ id: "src/lib/x.ts", label: "x.ts" }] },
      { id: "src/index.ts", label: "index.ts" },
    ],
  },
  { id: "docs", label: "docs", children: [{ id: "docs/readme", label: "readme.md" }, { id: "docs/guide", label: "guide.md" }] },
  { id: "remote", label: "remote", lazy: true },
  { id: "package.json", label: "package.json", actions: [{ id: "open", label: "Open package.json", text: "open" }] },
];

class App {
  static meta = {
    selector: "app-root",
    imports: [UiTree],
    template: html`<ui-tree label="Files" [nodes]="nodes()" [(expanded)]="expanded" [(selected)]="selected" [selectionMode]="mode()" [virtual]="virtual()" [loadChildren]="load" (activated)="activations.push($event.id)" (action)="onAction($event)"></ui-tree>`,
  };
  nodes = signal<TreeNode[]>(TREE);
  expanded = signal<string[]>([]);
  selected = signal<string[]>([]);
  mode = signal<"none" | "single" | "multiple">("single");
  virtual = signal(false);
  activations: string[] = [];
  actions: string[] = [];
  loads = 0;
  release: () => void = () => {};
  onAction(e: { action: string; node: TreeNode }) {
    this.actions.push(`${e.action}:${e.node.id}`);
  }
  load = (node: TreeNode): Promise<TreeNode[]> => {
    this.loads++;
    return new Promise((resolve) => (this.release = () => resolve([{ id: `${node.id}/a`, label: "alpha" }, { id: `${node.id}/b`, label: "beta" }])));
  };
}

const boot = useDomApp();
const rows = () => $$("[role=treeitem]");
const labelOf = (r: Element) => r.querySelector(".truncate")?.textContent?.trim() ?? "";
const labels = () => rows().map(labelOf);
const row = (label: string) => rows().find((r) => labelOf(r).startsWith(label))!;
const focused = () => labelOf(document.activeElement!);
const press = async (k: string, init: KeyboardEventInit = {}, el: Element = document.activeElement!) => {
  key(el, k, init);
  await settle();
};
const click = async (el: Element, init: MouseEventInit = {}) => {
  if (el.getAttribute("role") === "treeitem") (el as HTMLElement).focus(); // a browser focuses the row that is clicked
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
  await settle();
};
const focusFirst = async () => {
  (rows().find((r) => r.tabIndex === 0) as HTMLElement).focus();
  await settle();
};

describe("flattenTree", () => {
  it("lists the visible nodes with level, setsize and posinset per level", () => {
    const flat = flattenTree(TREE, new Set(["src", "src/app"]));
    expect(flat.map((f) => [f.id, f.level, f.posInSet, f.setSize, f.parent, f.expanded])).toEqual([
      ["src", 1, 1, 4, -1, true],
      ["src/app", 2, 1, 3, 0, true],
      ["src/app/main.ts", 3, 1, 2, 1, false],
      ["src/app/util.ts", 3, 2, 2, 1, false],
      ["src/lib", 2, 2, 3, 0, false],
      ["src/index.ts", 2, 3, 3, 0, false],
      ["docs", 1, 2, 4, -1, false],
      ["remote", 1, 3, 4, -1, false],
      ["package.json", 1, 4, 4, -1, false],
    ]);
  });

  it("expandableIds respects the depth and the visit limit", () => {
    expect(expandableIds(TREE)).toEqual(["src", "src/app", "src/lib", "docs"]);
    expect(expandableIds(TREE, { maxDepth: 1 })).toEqual([]);
    expect(expandableIds(TREE, { maxDepth: 2 })).toEqual(["src", "docs"]);
    expect(expandableIds(TREE, { limit: 1 })).toEqual(["src"]);
  });
});

describe("Tree", () => {
  it("has tree semantics, a single tab stop and levels", async () => {
    const app = await boot(App);
    app.expanded.set(["src", "src/app"]);
    await settle();
    const tree = $("ui-tree");
    expect(tree.getAttribute("role")).toBe("tree");
    expect(tree.getAttribute("aria-label")).toBe("Files");
    expect(tree.hasAttribute("aria-multiselectable")).toBe(false);
    expect(labels().slice(0, 4)).toEqual(["src", "app", "main.ts", "util.ts"]);
    const main = row("main.ts");
    expect(main.getAttribute("aria-level")).toBe("3");
    expect(main.getAttribute("aria-setsize")).toBe("2");
    expect(main.getAttribute("aria-posinset")).toBe("1");
    expect(main.hasAttribute("aria-expanded")).toBe(false);
    expect(row("src").getAttribute("aria-expanded")).toBe("true");
    expect(row("docs").getAttribute("aria-expanded")).toBe("false");
    expect(row("lib").getAttribute("aria-disabled")).toBe("true");
    expect(rows().filter((r) => r.tabIndex === 0)).toHaveLength(1);
    expect(rows()[0]!.getAttribute("aria-selected")).toBe("false");
    await expectNoA11yViolations(tree);
  });

  it("expands with the chevron and keeps selection out of it", async () => {
    const app = await boot(App);
    await click(row("src").querySelector("span.size-5")!);
    expect(app.expanded()).toEqual(["src"]);
    expect(app.selected()).toEqual([]);
    expect(labels()).toContain("app");
  });

  it("moves with the arrow keys, Home and End, skipping disabled rows", async () => {
    const app = await boot(App);
    app.expanded.set(["src", "src/app"]);
    await settle();
    await focusFirst();
    expect(focused()).toBe("src");
    await press("ArrowDown");
    expect(focused()).toBe("app");
    await press("ArrowDown");
    await press("ArrowDown");
    expect(focused()).toBe("util.ts");
    await press("ArrowDown"); // lib is disabled
    expect(focused()).toBe("index.ts");
    await press("End");
    expect(focused()).toBe("package.json");
    await press("Home");
    expect(focused()).toBe("src");
    await press("ArrowUp");
    expect(focused()).toBe("src");
    expect(rows().filter((r) => r.tabIndex === 0).map((r) => r.textContent!.trim())).toEqual(["src"]);
  });

  it("Right opens then enters, Left closes then goes to the parent", async () => {
    const app = await boot(App);
    await focusFirst();
    await press("ArrowRight");
    expect(app.expanded()).toEqual(["src"]);
    expect(focused()).toBe("src");
    await press("ArrowRight");
    expect(focused()).toBe("app");
    await press("ArrowRight");
    await press("ArrowRight");
    expect(focused()).toBe("main.ts");
    await press("ArrowRight"); // a leaf: nothing happens
    expect(focused()).toBe("main.ts");
    await press("ArrowLeft");
    expect(focused()).toBe("app");
    await press("ArrowLeft");
    expect(app.expanded()).toEqual(["src"]);
    await press("ArrowLeft");
    expect(focused()).toBe("src");
    await press("ArrowLeft");
    expect(app.expanded()).toEqual([]);
  });

  it("* opens the siblings, typing jumps to a label", async () => {
    const app = await boot(App);
    await focusFirst();
    await press("*");
    expect(app.expanded().sort()).toEqual(["docs", "remote", "src"]);
    await press("p");
    expect(focused()).toBe("package.json");
    await new Promise((r) => setTimeout(r, 550)); // a pause starts a new search
    await press("d");
    expect(focused()).toBe("docs");
    await press("e");
    expect(focused()).toBe("docs"); // "de" matches nothing: stay
    await new Promise((r) => setTimeout(r, 550));
    await press("r");
    expect(focused()).toBe("readme.md");
  });

  it("selects with Enter and Space in single mode, and Enter fires activated", async () => {
    const app = await boot(App);
    await focusFirst();
    await press(" ");
    expect(app.selected()).toEqual(["src"]);
    expect(row("src").getAttribute("aria-selected")).toBe("true");
    await press("ArrowDown");
    await press("Enter");
    expect(app.selected()).toEqual(["docs"]);
    expect(app.activations).toEqual(["docs"]);
    await click(row("package.json"));
    expect(app.selected()).toEqual(["package.json"]);
    expect(app.activations).toEqual(["docs", "package.json"]);
  });

  it("does nothing on selection when the mode is none, but still activates", async () => {
    const app = await boot(App);
    app.mode.set("none");
    await settle();
    await focusFirst();
    await press("Enter");
    expect(app.selected()).toEqual([]);
    expect(app.activations).toEqual(["src"]);
    expect(rows()[0]!.hasAttribute("aria-selected")).toBe(false);
  });

  it("multiple mode: Space toggles, Ctrl and Shift click, Shift+Arrow, Ctrl+A", async () => {
    const app = await boot(App);
    app.mode.set("multiple");
    app.expanded.set(["src", "docs"]);
    await settle();
    expect($("ui-tree").getAttribute("aria-multiselectable")).toBe("true");
    await focusFirst();
    await press(" ");
    await press("ArrowDown");
    await press("ArrowDown");
    await press(" ");
    expect(app.selected().sort()).toEqual(["src", "src/index.ts"]);
    await press(" ");
    expect(app.selected()).toEqual(["src"]);
    await click(row("readme.md"), { ctrlKey: true });
    expect(app.selected().sort()).toEqual(["docs/readme", "src"]);
    await click(row("src"));
    expect(app.selected()).toEqual(["src"]);
    await click(row("docs"), { shiftKey: true });
    expect(app.selected()).toEqual(["src", "src/app", "src/index.ts", "docs"]); // src/lib is disabled
    await click(row("src"));
    await press("ArrowDown", { shiftKey: true });
    await press("ArrowDown", { shiftKey: true });
    expect(app.selected()).toEqual(["src", "src/app", "src/index.ts"]);
    await press("a", { ctrlKey: true });
    expect(app.selected()).toHaveLength(rows().filter((r) => r.getAttribute("aria-disabled") !== "true").length);
  });

  it("collapsing a branch moves focus off its hidden descendants", async () => {
    const app = await boot(App);
    app.expanded.set(["src", "src/app"]);
    await settle();
    (row("main.ts") as HTMLElement).focus();
    await settle();
    await click(row("src").querySelector("span.size-5")!);
    expect(app.expanded()).toEqual(["src/app"]);
    expect(labelOf(rows().find((r) => r.tabIndex === 0)!)).toBe("src");
  });

  it("loads lazy children on first expand, with aria-busy meanwhile", async () => {
    const app = await boot(App);
    await focusFirst();
    await press("End");
    await press("ArrowUp");
    expect(focused()).toBe("remote");
    await press("ArrowRight");
    expect(row("remote").getAttribute("aria-busy")).toBe("true");
    app.release();
    await settle();
    expect(row("remote").hasAttribute("aria-busy")).toBe(false);
    expect(labels()).toContain("alpha");
    expect(row("alpha").getAttribute("aria-level")).toBe("2");
    await press("ArrowLeft");
    await press("ArrowRight");
    expect(app.loads).toBe(1);
  });

  it("row actions emit and only the active row's buttons are tabbable", async () => {
    const app = await boot(App);
    const open = row("package.json").querySelector("button")!;
    expect(open.getAttribute("aria-label")).toBe("Open package.json");
    expect(open.tabIndex).toBe(-1);
    await click(open);
    expect(app.actions).toEqual(["open:package.json"]);
    expect(app.selected()).toEqual([]); // the click did not reach the row
    await click(row("package.json"));
    expect(row("package.json").querySelector("button")!.tabIndex).toBe(0);
  });
});

// jsdom has no layout: the tree is 200px tall (7 rows of 28px).
Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 200 });

/** 100 folders x 100 files (10,100 nodes), all open. */
const BIG: TreeNode[] = Array.from({ length: 100 }, (_, f) => ({
  id: `d${f}`,
  label: `dir ${f}`,
  children: Array.from({ length: 100 }, (_, i) => ({ id: `d${f}/f${i}`, label: `file ${f}-${i}` })),
}));

describe("Tree, virtualized", () => {
  it("renders a window of a 10,000 node tree with per-level setsize and posinset", async () => {
    const app = await boot(App);
    app.nodes.set(BIG);
    app.expanded.set(BIG.map((n) => n.id));
    app.virtual.set(true);
    await settle();
    $("ui-tree").dispatchEvent(new Event("scroll"));
    await settle();
    const visible = rows();
    expect(visible.length).toBeGreaterThan(5);
    expect(visible.length).toBeLessThan(30);
    expect(visible[0]!.getAttribute("aria-level")).toBe("1");
    expect(visible[0]!.getAttribute("aria-setsize")).toBe("100");
    expect(visible[0]!.getAttribute("aria-posinset")).toBe("1");
    expect(visible[1]!.getAttribute("aria-level")).toBe("2");
    expect(visible[1]!.getAttribute("aria-setsize")).toBe("100");
    expect(visible[1]!.getAttribute("aria-posinset")).toBe("1");
    expect(visible[0]!.getAttribute("style")).toContain("position:absolute");
    expect($("ui-tree > div").getAttribute("style")).toContain(`height:${10_100 * 28}px`);
    expect(visible.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    await expectNoA11yViolations($("ui-tree"));
  });

  it("End and PageDown-like moves scroll the target in and focus it", async () => {
    const app = await boot(App);
    app.nodes.set(BIG);
    app.expanded.set(BIG.map((n) => n.id));
    app.virtual.set(true);
    await settle();
    await focusFirst();
    expect(focused()).toBe("dir 0");
    await press("End");
    expect(focused()).toBe("file 99-99");
    const last = document.activeElement!;
    expect(last.getAttribute("aria-posinset")).toBe("100");
    expect(last.getAttribute("data-index")).toBe("10099");
    expect(rows().length).toBeLessThan(30);
    await press("Home");
    expect(focused()).toBe("dir 0");
    await press("ArrowLeft"); // collapse dir 0: rows shift, focus stays on it
    expect(app.expanded()).not.toContain("d0");
    expect(focused()).toBe("dir 0");
    await press("ArrowDown");
    expect(focused()).toBe("dir 1");
    expect($("ui-tree > div").getAttribute("style")).toContain(`height:${(10_100 - 100) * 28}px`);
  });

  it("flattens 10,000 nodes fast enough", async () => {
    const started = performance.now();
    const flat = flattenTree(BIG, new Set(BIG.map((n) => n.id)));
    const took = performance.now() - started;
    expect(flat).toHaveLength(10_100);
    expect(took).toBeLessThan(250);
    // A deep chain does not overflow the stack.
    let chain: TreeNode = { id: "leaf", label: "leaf" };
    const ids = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      chain = { id: `n${i}`, label: "n", children: [chain] };
      ids.add(`n${i}`);
    }
    expect(flattenTree([chain], ids)).toHaveLength(20_001);
  });
});
