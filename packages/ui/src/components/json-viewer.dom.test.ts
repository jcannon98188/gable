// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiJsonViewer, stringifyValue } from "./json-viewer.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiJsonViewer],
    template: html`<ui-json-viewer label="Data" [value]="data()" [maxDepth]="depth()" [maxString]="20" [(expanded)]="expanded" (copied)="copies.push($event)"></ui-json-viewer>`,
  };
  data = signal<unknown>({ name: "Ada", age: 36, admin: true, nothing: null, tags: ["a", "b"], nested: { deep: { deeper: { deepest: 1 } } }, long: "x".repeat(50) });
  depth = signal(100);
  expanded = signal<string[]>(["$"]);
  copies: Array<{ kind: string; text: string; ok: boolean }> = [];
}

const boot = useDomApp();
const rows = () => $$("[role=treeitem]");
const labelOf = (r: Element) => r.querySelector(".truncate")?.textContent?.trim() ?? "";
const labels = () => rows().map(labelOf);
const row = (label: string) => rows().find((r) => labelOf(r) === label)!;
const desc = (label: string) => row(label).querySelectorAll(".truncate")[1]!;
const press = async (el: Element, k: string) => {
  key(el, k);
  await settle();
};
const button = (text: string) => $$("button").find((b) => b.textContent!.trim() === text)!;
const copyButton = (label: string, what: "path" | "value") => row(label).querySelector<HTMLButtonElement>(`button[aria-label="Copy ${what} of ${label}"]`)!;

function clipboard(): { writes: string[] } {
  const writes: string[] = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t: string) => (writes.push(t), Promise.resolve()) } });
  return { writes };
}

describe("stringifyValue", () => {
  it("writes cycles, bigints, undefined and Dates readably", () => {
    const a: Record<string, unknown> = { n: 1n, u: undefined, d: new Date(0), m: new Map([["k", 1]]), s: new Set([1]), f() {} };
    a.self = a;
    expect(JSON.parse(stringifyValue(a))).toEqual({ n: "1n", u: "undefined", d: "1970-01-01T00:00:00.000Z", m: { k: 1 }, s: [1], f: "[Function f]", self: "[Circular]" });
  });
});

describe("JSON viewer", () => {
  it("shows the root open with type-coloured values and no axe violations", async () => {
    await boot(App);
    expect(labels()).toEqual(["root", "name", "age", "admin", "nothing", "tags", "nested", "long"]);
    expect(desc("root").textContent).toBe("{7 keys}");
    expect(desc("name").textContent).toBe('"Ada"');
    expect(desc("name").className).toContain("text-success");
    expect(desc("age").className).toContain("text-info");
    expect(desc("admin").className).toContain("text-warning");
    expect(desc("nothing").textContent).toBe("null");
    expect(desc("nothing").className).toContain("text-muted-foreground");
    expect(desc("tags").textContent).toBe("[2 items]");
    expect(row("tags").getAttribute("aria-expanded")).toBe("false");
    expect(row("name").hasAttribute("aria-expanded")).toBe(false);
    expect(desc("long").textContent).toBe('"xxxxxxxxxxxxxxxxxxxx…" (50 chars)');
    await expectNoA11yViolations($("ui-json-viewer"));
  });

  it("opens children on demand and with Expand all / Collapse all", async () => {
    const app = await boot(App);
    await press(row("tags"), "ArrowRight");
    expect(app.expanded()).toEqual(["$", "$.tags"]);
    expect(labels()).toContain("0");
    expect(row("0").getAttribute("aria-level")).toBe("3");
    button("Collapse all").click();
    await settle();
    expect(labels()).toEqual(["root"]);
    button("Expand all").click();
    await settle();
    expect(app.expanded().sort()).toEqual(["$", "$.nested", "$.nested.deep", "$.nested.deep.deeper", "$.tags"].sort());
    expect(labels()).toContain("deepest");
    expect($("[role=status]").textContent).toBe("Expanded all");
  });

  it("copies the path and the value, and reports when there is no clipboard", async () => {
    const app = await boot(App);
    const { writes } = clipboard();
    await press(row("nested"), "ArrowRight");
    await press(row("deep"), "ArrowRight");
    copyButton("deep", "path").click();
    copyButton("deep", "value").click();
    await settle();
    expect(writes[0]).toBe("$.nested.deep");
    expect(JSON.parse(writes[1]!)).toEqual({ deeper: { deepest: 1 } });
    expect(app.copies.map((c) => [c.kind, c.ok])).toEqual([
      ["path", true],
      ["value", true],
    ]);
    expect($("[role=status]").textContent).toBe("Copied value");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    copyButton("name", "path").click();
    await settle();
    expect(app.copies.at(-1)).toEqual({ kind: "path", text: "$.name", ok: false });
  });

  it("marks cycles, quotes odd keys in paths and stops at maxDepth", async () => {
    const app = await boot(App);
    const loop: Record<string, unknown> = { id: 1, "odd key": { x: 1 } };
    loop.me = loop;
    loop.list = [loop];
    app.data.set(loop);
    await settle();
    expect(desc("me").textContent).toBe("[Circular]");
    expect(row("me").hasAttribute("aria-expanded")).toBe(false);
    await press(row("list"), "ArrowRight");
    expect(desc("0").textContent).toBe("[Circular]");
    await press(row("odd key"), "ArrowRight");
    copyButton("x", "path").click();
    await settle();
    expect(app.copies.at(-1)!.text).toBe('$["odd key"].x');
    app.depth.set(2);
    app.data.set({ a: { b: { c: 1 } } });
    app.expanded.set(["$", "$.a"]);
    await settle();
    expect(desc("b").textContent).toBe("{1 key} …");
    expect(row("b").hasAttribute("aria-expanded")).toBe(false);
  });

  it("groups long arrays into chunks", async () => {
    const app = await boot(App);
    app.data.set({ big: Array.from({ length: 250 }, (_, i) => i), huge: new Array(100_000).fill(0) });
    app.expanded.set(["$", "$.big", "$.huge"]);
    await settle();
    expect(labels()).toEqual(["root", "big", "[0..99]", "[100..199]", "[200..249]", "huge", "[0..9999]", "[10000..19999]", "[20000..29999]", "[30000..39999]", "[40000..49999]", "[50000..59999]", "[60000..69999]", "[70000..79999]", "[80000..89999]", "[90000..99999]"]);
    expect(desc("[200..249]").textContent).toBe("50 items");
    app.expanded.set(["$", "$.big", "$.big#100-199"]);
    await settle();
    expect(labels().slice(0, 6)).toEqual(["root", "big", "[0..99]", "[100..199]", "100", "101"]);
    expect(row("100").getAttribute("aria-level")).toBe("4");
    expect(copyButton("100", "path").getAttribute("aria-label")).toBe("Copy path of 100");
  });
});
