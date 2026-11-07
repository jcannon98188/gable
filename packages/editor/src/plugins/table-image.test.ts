// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { GableEditor, collabPlugin, corePlugin, imagePlugin, tablePlugin, type EditorPlugin } from "../index.js";

const tick = () => new Promise((r) => setTimeout(r, 0));
const make = (plugins: EditorPlugin[], content?: string) =>
  new GableEditor({ plugins: [corePlugin, ...plugins], element: document.createElement("div"), content });
type J = { type?: string; attrs?: Record<string, unknown>; content?: J[] };
const findNode = (n: J, type: string): J | undefined => (n.type === type ? n : n.content?.map((c) => findNode(c, type)).find(Boolean));
const selectImage = (ed: GableEditor) => {
  let at = -1;
  ed.editor.state.doc.descendants((n, pos) => {
    if (n.type.name === "image") at = pos;
  });
  ed.editor.commands.setNodeSelection(at);
};
const item = (ed: GableEditor, id: string) => ed.toolbar.find((i) => i.id === id)!;

describe("tablePlugin", () => {
  it("inserts a table and edits rows, columns, header and merges", () => {
    const ed = make([tablePlugin], "<p>x</p>");
    expect(item(ed, "addRowAfter").isEnabled!(ed.editor)).toBe(false);
    item(ed, "insertTable").run(ed.editor);
    const count = (sel: string) => ed.editor.view.dom.querySelectorAll(sel).length;
    expect(count("tr")).toBe(3);
    expect(count("th")).toBe(3);
    expect(item(ed, "addRowAfter").isEnabled!(ed.editor)).toBe(true);
    item(ed, "addRowAfter").run(ed.editor);
    item(ed, "addColumnAfter").run(ed.editor);
    expect(count("tr")).toBe(4);
    expect(count("tr:first-child > *")).toBe(4);
    item(ed, "deleteRow").run(ed.editor);
    item(ed, "deleteColumn").run(ed.editor);
    expect(count("tr")).toBe(3);
    item(ed, "toggleHeaderRow").run(ed.editor);
    item(ed, "deleteTable").run(ed.editor);
    expect(count("table")).toBe(0);
    ed.destroy();
  });

  it("round-trips merged cells and header cells through HTML", () => {
    const html = '<table><tbody><tr><th colspan="2"><p>h</p></th></tr><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>';
    const ed = make([tablePlugin], html);
    expect(ed.editor.getHTML()).toContain('colspan="2"');
    expect(ed.editor.getHTML()).toContain("<th");
    ed.destroy();
  });
});

describe("imagePlugin", () => {
  it("embeds by URL and sets width, alt and caption", () => {
    const ed = make([imagePlugin()], "<p>x</p>");
    item(ed, "image").runWith!(ed.editor, "https://x/y.png");
    selectImage(ed);
    expect(ed.editor.isActive("image")).toBe(true);
    ed.editor.commands.setImageWidth(10); // clamped to the minimum
    ed.editor.commands.setImageWidth(300);
    item(ed, "imageAlt").runWith!(ed.editor, "a cat");
    ed.editor.commands.setImageCaption("Figure 1");
    const img = ed.editor.view.dom.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://x/y.png");
    expect(img.getAttribute("width")).toBe("300");
    expect(img.getAttribute("alt")).toBe("a cat");
    expect(ed.editor.view.dom.querySelector("figcaption")!.textContent).toBe("Figure 1");
    expect(ed.editor.getHTML()).toMatch(new RegExp("<figure[^>]*><img [^>]*><figcaption[^>]*>Figure 1</figcaption></figure>"));
    ed.destroy();
  });

  it("toggles a caption on and off from the toolbar and edits it in place", () => {
    const ed = make([imagePlugin()], "<p>x</p>");
    item(ed, "image").runWith!(ed.editor, "https://x/y.png");
    selectImage(ed);
    const toggle = item(ed, "imageCaption");
    expect(toggle.isEnabled!(ed.editor)).toBe(true);
    expect(toggle.isActive!(ed.editor)).toBe(false);
    toggle.run(ed.editor);
    expect(toggle.isActive!(ed.editor)).toBe(true);
    expect(ed.editor.isActive("figcaption")).toBe(true); // the caret is in the empty caption
    ed.editor.commands.insertContent("A bold caption");
    expect(ed.editor.view.dom.querySelector("figcaption")!.textContent).toBe("A bold caption");
    toggle.run(ed.editor); // off: the image stays, the caption goes
    expect(ed.editor.view.dom.querySelector("figcaption")).toBeNull();
    expect(ed.editor.view.dom.querySelector("figure")).toBeNull();
    expect(ed.editor.view.dom.querySelector("img")).not.toBeNull();
    ed.destroy();
  });

  it("Enter in a caption moves to the paragraph after the figure", () => {
    const ed = make([imagePlugin()], "<p>x</p>");
    item(ed, "image").runWith!(ed.editor, "https://x/y.png");
    selectImage(ed);
    item(ed, "imageCaption").run(ed.editor);
    ed.editor.view.someProp("handleKeyDown", (h) => h(ed.editor.view, new KeyboardEvent("keydown", { key: "Enter" })));
    expect(ed.editor.state.selection.$from.parent.type.name).toBe("paragraph");
    ed.destroy();
  });

  it("loads documents that kept the caption in an attribute as a figure", async () => {
    const ed = make([imagePlugin()], '<p>x</p><img src="https://x/y.png" data-caption="Old caption">');
    await tick(); // the conversion runs when the editor reports it is created
    expect(ed.editor.view.dom.querySelector("figcaption")!.textContent).toBe("Old caption");
    expect(ed.editor.getHTML()).not.toContain("data-caption");
    ed.destroy();
  });

  it("drag-resizes through the handle and with the keyboard", () => {
    const ed = make([imagePlugin({ minWidth: 20 })], "<p>x</p>");
    item(ed, "image").runWith!(ed.editor, "https://x/y.png");
    const img = ed.editor.view.dom.querySelector("img")!;
    img.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
    const handle = ed.editor.view.dom.querySelector<HTMLElement>("[data-resize-handle]")!;
    const ev = (type: string, x: number) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x });
    handle.dispatchEvent(ev("pointerdown", 0));
    document.dispatchEvent(ev("pointermove", 50));
    document.dispatchEvent(ev("pointerup", 50));
    expect(findNode(ed.editor.getJSON(), "image")!.attrs!.width).toBe(150);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    expect(findNode(ed.editor.getJSON(), "image")!.attrs!.width).toBeLessThan(150);
    ed.destroy();
  });

  it("uploads through the adapter and inserts the returned URL; failures are reported", async () => {
    const errors: unknown[] = [];
    const ed = make([imagePlugin({ upload: async (f) => `https://cdn/${f.name}`, onUploadError: (e) => errors.push(e) })], "<p>x</p>");
    expect(ed.editor.commands.uploadImage(new File(["x"], "pic.png", { type: "image/png" }))).toBe(true);
    await tick();
    expect(ed.editor.view.dom.querySelector("img")!.getAttribute("src")).toBe("https://cdn/pic.png");
    expect(ed.editor.commands.uploadImage(new File(["x"], "a.txt", { type: "text/plain" }))).toBe(false);

    const bad = make([imagePlugin({ upload: async () => { throw new Error("nope"); }, onUploadError: (e) => errors.push(e) })], "<p>x</p>");
    bad.editor.commands.uploadImage(new File(["x"], "p.png", { type: "image/png" }));
    await tick();
    expect(errors).toHaveLength(1);
    expect(bad.editor.view.dom.querySelector("img")).toBeNull();
    expect(make([imagePlugin()]).editor.commands.uploadImage(new File(["x"], "p.png", { type: "image/png" }))).toBe(false);
  });
});

describe("tables and images over Yjs", () => {
  it("sync between two editors, including merged cells and image attributes", async () => {
    const d1 = new Y.Doc();
    const d2 = new Y.Doc();
    d1.on("update", (u: Uint8Array, o: unknown) => o !== "r" && Y.applyUpdate(d2, u, "r"));
    d2.on("update", (u: Uint8Array, o: unknown) => o !== "r" && Y.applyUpdate(d1, u, "r"));
    const plugins = (d: Y.Doc) => [tablePlugin, imagePlugin(), collabPlugin({ ydoc: d, captureTimeout: 0 })];
    const a = make(plugins(d1), "<p>start</p>");
    await tick();
    const b = make(plugins(d2));
    await tick();

    item(a, "insertTable").run(a.editor);
    expect(b.editor.view.dom.querySelectorAll("tr").length).toBe(3);
    item(a, "addRowAfter").run(a.editor);
    item(a, "image").runWith!(a.editor, "https://x/y.png");
    selectImage(a);
    a.editor.commands.setImageWidth(200);
    a.editor.commands.setImageCaption("cap");
    expect(b.editor.getJSON()).toEqual(a.editor.getJSON());
    expect(b.editor.view.dom.querySelector("figcaption")!.textContent).toBe("cap");
    // b edits the caption in place; a sees it
    let capEnd = -1;
    b.editor.state.doc.descendants((n, pos) => {
      if (n.type.name === "figcaption") capEnd = pos + n.nodeSize - 1;
    });
    b.editor.commands.setTextSelection(capEnd);
    b.editor.commands.insertContent("!");
    expect(a.editor.view.dom.querySelector("figcaption")!.textContent).toBe("cap!");
    expect(b.editor.view.dom.querySelectorAll("tr").length).toBe(4);
    expect(findNode(b.editor.getJSON(), "image")!.attrs).toMatchObject({ width: 200 });

    // b types into a cell while a adds a column
    b.editor.commands.setTextSelection(b.editor.view.dom.querySelector("td") ? 8 : 1);
    b.editor.commands.insertContent("hey");
    item(a, "addColumnAfter").run(a.editor);
    expect(b.editor.getJSON()).toEqual(a.editor.getJSON());
    // undo is per user: a's undo removes a's column change, not b's text
    a.editor.commands.undo();
    expect(JSON.stringify(a.editor.getJSON())).toContain("hey");
    expect(b.editor.getJSON()).toEqual(a.editor.getJSON());
    a.destroy();
    b.destroy();
  });
});
