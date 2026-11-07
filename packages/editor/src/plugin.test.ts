// @vitest-environment jsdom
import { Mark } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { GableEditor, PluginError, collectToolbar, corePlugin, definePlugin, resolvePlugins } from "./index.js";

const bold = definePlugin({
  name: "bold",
  requires: ["core"],
  extensions: [
    Mark.create({
      name: "bold",
      parseHTML: () => [{ tag: "strong" }],
      renderHTML: () => ["strong", 0],
    }),
  ],
  toolbar: [
    {
      id: "bold",
      label: "Bold",
      order: 1,
      run: (e) => e.commands.toggleMark("bold"),
      isActive: (e) => e.isActive("bold"),
    },
  ],
});

describe("resolvePlugins", () => {
  it("orders dependencies first regardless of registration order", () => {
    expect(resolvePlugins([bold, corePlugin]).map((p) => p.name)).toEqual(["core", "bold"]);
  });
  it("breaks ties by priority", () => {
    const a = definePlugin({ name: "a", priority: 1 });
    const b = definePlugin({ name: "b", priority: 5 });
    expect(resolvePlugins([a, b]).map((p) => p.name)).toEqual(["b", "a"]);
  });
  it("rejects missing, duplicate and cyclic plugins", () => {
    expect(() => resolvePlugins([bold])).toThrow(PluginError);
    expect(() => resolvePlugins([corePlugin, corePlugin])).toThrow(/Duplicate/);
    const x = definePlugin({ name: "x", requires: ["y"] });
    const y = definePlugin({ name: "y", requires: ["x"] });
    expect(() => resolvePlugins([x, y])).toThrow(/cycle/);
  });
});

describe("collectToolbar", () => {
  it("sorts by order and rejects duplicate ids", () => {
    const item = (id: string, order: number) => ({ id, label: id, order, run: () => true });
    const p = definePlugin({ name: "p", toolbar: [item("b", 2), item("a", 1)] });
    expect(collectToolbar([p]).map((i) => i.id)).toEqual(["a", "b"]);
    expect(() => collectToolbar([p, definePlugin({ name: "q", toolbar: [item("a", 1)] })])).toThrow(/Duplicate/);
  });
});

describe("GableEditor", () => {
  it("builds a schema from plugins and runs plugin commands", () => {
    const ed = new GableEditor({ plugins: [bold, corePlugin], content: "<p>hi</p>" });
    expect(Object.keys(ed.editor.schema.marks)).toContain("bold");
    ed.editor.commands.selectAll();
    ed.toolbar[0]!.run(ed.editor);
    expect(ed.editor.getHTML()).toBe("<p><strong>hi</strong></p>");
    ed.destroy();
  });
  it("runs yjs hooks on attach and disposes them on destroy", () => {
    const log: string[] = [];
    const p = definePlugin({
      name: "y",
      requires: ["core"],
      yjs: ({ ydoc }) => {
        log.push(`attach:${ydoc instanceof Y.Doc}`);
        return () => log.push("dispose");
      },
    });
    const ed = new GableEditor({ plugins: [corePlugin, p] });
    ed.attachYDoc(new Y.Doc());
    ed.destroy();
    const ed2 = new GableEditor({ plugins: [corePlugin, p], ydoc: new Y.Doc() });
    ed2.destroy();
    expect(log).toEqual(["attach:true", "dispose", "attach:true", "dispose"]);
  });
});
