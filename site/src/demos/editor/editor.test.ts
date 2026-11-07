// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { DEMOS } from "../../docs/demos.js";
import { EditorDemo, demoPlugins } from "./editor-demo.js";

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("timed out");
}

// jsdom has no layout: give ranges and text nodes the geometry ProseMirror asks for when it scrolls a selection into view.
const rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => rect;

function open() {
  const root = document.createElement("div");
  document.body.append(root);
  const app = bootstrap(EditorDemo, { renderer: dom(), target: root });
  return { root, app };
}

describe("EditorDemo", () => {
  it("is registered with its real source", async () => {
    expect(DEMOS["editor"]).toBeTruthy();
    expect(await DEMOS["editor"]!.source()).toContain("class EditorDemo");
  });

  it("loads the plugins in dependency order and mounts a real editor with a toolbar", async () => {
    expect(demoPlugins.map((p) => p.name)).toContain("highlight");
    const { root } = open();
    await until(() => !!root.querySelector(".ProseMirror"));
    await until(() => root.querySelectorAll(".ed-btn").length >= 10);
    const labels = [...root.querySelectorAll<HTMLElement>(".ed-btn")].map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(expect.arrayContaining(["Bold", "Highlight", "Clear formatting", "Undo", "Redo"]));
    expect(root.querySelector(".ed-surface h2")?.textContent).toBe("Gable editor");
    expect(root.querySelector(".ed-stat")?.textContent).toMatch(/\d+ words/);
  });

  it("toggles a mark from the toolbar and reports it in the document HTML", async () => {
    const { root, app } = open();
    await until(() => !!root.querySelector(".ProseMirror"));
    const pm = root.querySelector<HTMLElement>(".ProseMirror")!;
    const gable = (app.instance as unknown as { gable(): { editor: { commands: { setTextSelection(r: { from: number; to: number }): boolean } } } }).gable();
    gable.editor.commands.setTextSelection({ from: 1, to: 6 });
    const button = [...root.querySelectorAll<HTMLButtonElement>(".ed-btn")].find((b) => b.getAttribute("aria-label") === "Highlight")!;
    button.click();
    await until(() => button.getAttribute("aria-pressed") === "true");
    expect(pm.querySelector("h2 mark")?.textContent).toBe("Gable");
    root.querySelector<HTMLDetailsElement>("details")!.open = true;
    await until(() => (root.querySelector(".ed-pre")?.textContent ?? "").includes("<mark>"));
  });

  it("locks the document with the read-only box", async () => {
    const { root } = open();
    await until(() => !!root.querySelector(".ProseMirror"));
    const box = root.querySelector<HTMLInputElement>(".ed-check input")!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await until(() => root.querySelector(".ProseMirror")!.getAttribute("contenteditable") === "false");
    expect(root.querySelector<HTMLButtonElement>(".ed-btn")!.disabled).toBe(true);
  });
});
