// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, type ComponentClass } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { dom } from "@gable/renderer-dom";
import { DialogDemo } from "./dialog-demo.js";
import { TabsDemo } from "./tabs-demo.js";
import { RovingDemo } from "./roving-demo.js";
import { VariantsDemo } from "../ui/variants-demo.js";

let host: HTMLElement;
let destroy: () => void = () => {};
const realRaf = globalThis.requestAnimationFrame;
beforeEach(() => {
  // Zag chains animation frames; give each its own task (jsdom runs a frame's callbacks in one loop).
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  document.body.replaceChildren();
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  destroy();
  destroy = () => {};
});

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
async function boot<T>(Root: ComponentClass): Promise<T> {
  const ref = bootstrap(Root, { renderer: dom(), target: host }) as unknown as { instance: T; destroy(): void };
  destroy = () => ref.destroy();
  await settle();
  return ref.instance;
}
const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("DialogDemo", () => {
  it("opens from the trigger, closes with Escape and Save, and reports the state", async () => {
    const demo = await boot<DialogDemo>(DialogDemo);
    expect($("[role=dialog]").hidden).toBe(true);
    $("[uiDialogTrigger]").click();
    await settle();
    expect(demo.open()).toBe(true);
    expect($("[role=dialog]").hidden).toBe(false);
    expect(host.textContent).toContain("Dialog open");
    key(document.activeElement ?? document.body, "Escape");
    await settle();
    expect(demo.open()).toBe(false);
    demo.open.set(true);
    await settle();
    demo.save();
    await settle();
    expect(demo.saved()).toBe(1);
    expect($("[role=dialog]").hidden).toBe(true);
    expect(host.textContent).toContain("Saved 1 time(s)");
  });
});

describe("TabsDemo", () => {
  it("selects on click and walks the tabs with the arrow keys, skipping the disabled one", async () => {
    const demo = await boot<TabsDemo>(TabsDemo);
    expect($("[role=tablist]")).toBeTruthy();
    $("[data-value=activity]").click();
    await settle();
    expect(demo.tab()).toBe("activity");
    expect(host.textContent).toContain("Selected tab: activity");
    $("[data-value=activity]").focus();
    key($("[data-value=activity]"), "ArrowRight");
    await settle();
    expect(document.activeElement).toBe($("[data-value=settings]"));
  });
});

describe("RovingDemo", () => {
  it("gives one button the tab stop and moves it with the arrows, skipping the disabled button", async () => {
    const demo = await boot<RovingDemo>(RovingDemo);
    const items = [...document.querySelectorAll<HTMLElement>("[uiRovingItem]")];
    expect(items.map((b) => b.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
    items[1]!.focus();
    key(items[1]!, "ArrowRight"); // Paste is disabled: lands on Undo
    expect(document.activeElement).toBe(items[3]);
    expect(demo.last()).toBe("Undo");
    key(items[3]!, "ArrowRight"); // wraps
    expect(document.activeElement).toBe(items[0]);
    demo.setOrientation("vertical");
    await settle();
    expect($("[role=toolbar]").classList.contains("vertical")).toBe(true);
    key(items[0]!, "ArrowRight"); // ignored in a vertical group
    expect(document.activeElement).toBe(items[0]);
    key(items[0]!, "ArrowDown");
    expect(document.activeElement).toBe(items[1]);
  });
});

describe("VariantsDemo", () => {
  it("computes the real buttonVariants class string and merges conflicts", async () => {
    const demo = await boot<VariantsDemo>(VariantsDemo);
    expect(demo.classes()).toContain("bg-primary");
    expect(demo.classes()).toContain("h-12"); // the caller's class replaced h-9
    expect(demo.classes()).not.toContain("h-9");
    expect(demo.classes()).toContain("bg-red-500");
    expect(demo.classes().split(" ")).not.toContain("bg-primary");
    demo.pickVariant("outline");
    demo.extra.set("");
    await settle();
    expect(demo.classes()).toContain("hover:bg-accent");
    expect(demo.classes()).toContain("h-9");
    expect(demo.merged()).toBe("py-1 px-4");
    expect(host.textContent).toContain("classes from");
  });
});
