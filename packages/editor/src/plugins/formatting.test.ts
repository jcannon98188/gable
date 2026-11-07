// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  GableEditor,
  basicStylesPlugin,
  blockPlugin,
  corePlugin,
  formattingPlugins,
  headingPlugin,
  historyPlugin,
  linkPlugin,
  listPlugin,
} from "../index.js";

const make = (content: string) =>
  new GableEditor({
    plugins: [corePlugin, ...formattingPlugins, historyPlugin],
    element: document.createElement("div"),
    content,
  });
const item = (ed: GableEditor, id: string) => ed.toolbar.find((i) => i.id === id)!;

describe("formatting plugins", () => {
  it("exposes the expected toolbar items in order", () => {
    const ed = make("<p>x</p>");
    expect(ed.toolbar.map((i) => i.id)).toEqual([
      "undo", "redo", "bold", "italic", "underline", "strike", "code", "link",
      "heading1", "heading2", "heading3", "blockquote", "codeBlock", "horizontalRule",
      "bulletList", "orderedList", "taskList",
    ]);
    ed.destroy();
  });

  it("round-trips all supported HTML", () => {
    const html =
      '<h2>T</h2><p><strong>b</strong><em>i</em><u>u</u><s>s</s><code>c</code><a href="https://x.y">l</a></p>' +
      "<blockquote><p>q</p></blockquote><pre><code>x</code></pre><hr>" +
      "<ul><li><p>a</p></li></ul><ol><li><p>b</p></li></ol>" +
      '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>t</p></div></li></ul>';
    const ed = make(html);
    const out = ed.editor.getHTML();
    for (const part of ["<h2>T</h2>", "<strong>b</strong>", "<em>i</em>", "<u>u</u>", "<s>s</s>", "<code>c</code>", "<blockquote>", "<pre>", "<hr>", "<ul><li>", "<ol>", 'data-type="taskList"']) {
      expect(out).toContain(part);
    }
    ed.destroy();
  });

  it("toolbar items toggle and report active state", () => {
    const ed = make("<p>hello</p>");
    ed.editor.commands.selectAll();
    const bold = item(ed, "bold");
    expect(bold.isActive!(ed.editor)).toBe(false);
    bold.run(ed.editor);
    expect(bold.isActive!(ed.editor)).toBe(true);
    item(ed, "heading2").run(ed.editor);
    expect(ed.editor.getHTML()).toBe("<h2><strong>hello</strong></h2>");
    expect(item(ed, "heading2").isActive!(ed.editor)).toBe(true);
    item(ed, "bulletList").run(ed.editor);
    expect(ed.editor.isActive("bulletList")).toBe(true);
    ed.destroy();
  });

  it("link item collects a url, then removes the link when active", () => {
    const ed = make("<p>hello</p>");
    ed.editor.commands.selectAll();
    const link = item(ed, "link");
    expect(link.input?.kind).toBe("url");
    expect(link.run(ed.editor)).toBe(false);
    link.runWith!(ed.editor, "https://a.b");
    expect(ed.editor.getHTML()).toContain('href="https://a.b"');
    expect(link.isActive!(ed.editor)).toBe(true);
    link.run(ed.editor);
    expect(ed.editor.getHTML()).toBe("<p>hello</p>");
    ed.destroy();
  });

  it("undo/redo item enablement follows history", () => {
    const ed = make("<p>hello</p>");
    expect(item(ed, "undo").isEnabled!(ed.editor)).toBe(false);
    ed.editor.commands.insertContent("!");
    expect(item(ed, "undo").isEnabled!(ed.editor)).toBe(true);
    item(ed, "undo").run(ed.editor);
    expect(ed.editor.getHTML()).toBe("<p>hello</p>");
    expect(item(ed, "redo").isEnabled!(ed.editor)).toBe(true);
    ed.destroy();
  });

  it("every plugin is individually usable with core", () => {
    for (const p of [basicStylesPlugin, linkPlugin, headingPlugin, blockPlugin, listPlugin, historyPlugin]) {
      new GableEditor({ plugins: [corePlugin, p] }).destroy();
    }
  });
});

describe("input rules and shortcuts", () => {
  const type = (ed: GableEditor, text: string) => {
    const { view } = ed.editor;
    for (const ch of text) {
      const { from, to } = view.state.selection;
      if (!view.someProp("handleTextInput", (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))) {
        view.dispatch(view.state.tr.insertText(ch, from, to));
      }
    }
  };
  it("markdown-style rules convert as you type", () => {
    const heading = make("<p></p>");
    heading.editor.commands.focus();
    type(heading, "## Title");
    expect(heading.editor.getHTML()).toBe("<h2>Title</h2>");
    const list = make("<p></p>");
    list.editor.commands.focus();
    type(list, "- item");
    expect(list.editor.isActive("bulletList")).toBe(true);
    const bold = make("<p></p>");
    bold.editor.commands.focus();
    type(bold, "**hi**");
    expect(bold.editor.getHTML()).toBe("<p><strong>hi</strong></p>");
  });
  it("registers the standard keyboard shortcuts", () => {
    const ed = make("<p>x</p>");
    const keys = ed.editor.extensionManager.extensions.flatMap((e) => Object.keys((e.config as { addKeyboardShortcuts?: () => object }).addKeyboardShortcuts?.call({ name: e.name, editor: ed.editor, options: e.options, type: null, parent: undefined } as never) ?? {}));
    expect(keys).toEqual(expect.arrayContaining(["Mod-b", "Mod-i", "Mod-u"]));
  });
});
