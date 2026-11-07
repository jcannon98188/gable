// TASK-56.12: the template outline, Problems quick fixes, and the pure helpers behind the canvas polish
// (route history, drop placement, text scale).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hash } from "./server/edit/hunks.js";
import { EditService } from "./server/edit/service.js";
import type { EditResult } from "./server/edit/types.js";
import { clampTextScale, sanitizeSettings } from "./devices.js";
import { dropWhere } from "./protocol.js";
import { elementLabel } from "../shell/src/app/canvas-overlays.js";
import { NavHistory } from "../shell/src/app/page-state.js";

const BODY = `
  <li class="todo row" [class.done]="done()">
    <input class="toggle" type="checkbox" [checked]="done()" (change)="toggle()" />
    <label>{{ title() }} by {{ owner() }}</label>
    @if (editing()) {
      <input class="edit" [value]="title()" />
    } @else {
      <button class="destroy" (click)="remove()">x</button>
    }
  </li>
`;
const FILE = (body: string) => `import { html } from "@gable/core";\n\nexport class TodoItem {\n  static meta = {\n    selector: "todo-item",\n    template: html\`${body}\`,\n  };\n}\n`;

function project(eol = "\n") {
  const root = mkdtempSync(join(tmpdir(), "gable-polish-"));
  mkdirSync(join(root, "src"));
  const file = join(root, "src", "todo-item.ts");
  writeFileSync(file, FILE(BODY).replaceAll("\n", eol));
  return { root, file, svc: new EditService(root), text: () => readFileSync(file, "utf8") };
}

const ok = (r: EditResult) => {
  if (!r.ok) throw new Error(`${r.code}: ${r.error}`);
  return r;
};

describe("structure: the template outline", () => {
  it("lists elements with classes, bindings and their interpolations, and blocks as read-only", () => {
    const p = project();
    const r = p.svc.outline({ raw: BODY, file: "src/todo-item.ts" });
    if (!r.ok) throw new Error(r.error);
    expect(r.file).toBe("src/todo-item.ts");
    expect(r.line).toBe(6);
    const rows = r.rows.map((x) => [x.depth, x.kind, x.label, x.detail, x.readOnly, x.conditional]);
    expect(rows).toEqual([
      [0, "element", "li.todo.row", "1 binding", false, false],
      [1, "element", "input.toggle", "2 bindings", false, false],
      [1, "element", "label", "", false, false],
      [1, "block", "@if (editing())", "read-only", true, false],
      [2, "element", "input.edit", "1 binding", false, true],
      [1, "block", "@else", "", true, false],
      [2, "element", "button.destroy", "1 binding", false, true],
    ]);
    expect(r.rows[2]!.interpolations).toEqual(["{{ title() }}", "{{ owner() }}"]);
    // a row's start is the element's `<` in the body: the handle the agent maps to a rendered node
    expect(BODY.slice(r.rows[1]!.start, r.rows[1]!.start + 6)).toBe("<input");
  });

  it("refuses a template that is no longer in the file", () => {
    const p = project();
    const r = p.svc.outline({ raw: BODY.replace("todo", "gone"), file: "src/todo-item.ts" });
    expect(r.ok).toBe(false);
  });
});

describe("problems: applying a quick fix", () => {
  it("applies the fix as one undoable edit, CRLF files included", () => {
    for (const eol of ["\n", "\r\n"]) {
      const p = project(eol);
      const before = p.text();
      const at = before.indexOf("title() }} by") + "title".length;
      ok(p.svc.applyFix("src/todo-item.ts", hash(before), [{ start: at, length: 2, newText: "Text()" }], "Rename"));
      expect(p.text()).toBe(before.slice(0, at) + "Text()" + before.slice(at + 2));
      expect(p.svc.history().undo.map((h) => h.label)).toEqual(["Rename"]);
      ok(p.svc.undo());
      expect(p.text()).toBe(before);
    }
  });

  it("refuses when the file changed since it was analysed, or the fix does not fit", () => {
    const p = project();
    const before = p.text();
    writeFileSync(p.file, before + "\n// edited\n");
    const stale = p.svc.applyFix("src/todo-item.ts", hash(before), [{ start: 0, length: 0, newText: "x" }], "Fix");
    expect(stale).toMatchObject({ ok: false, code: "stale" });
    const now = p.text();
    expect(p.svc.applyFix("src/todo-item.ts", hash(now), [{ start: now.length, length: 5, newText: "" }], "Fix")).toMatchObject({ ok: false, code: "invalid" });
    expect(p.svc.applyFix("../outside.ts", hash(now), [], "Fix")).toMatchObject({ ok: false });
    expect(p.text()).toBe(now);
  });
});

describe("polish: route history", () => {
  it("goes back and forward without cutting the forward list on arrival", () => {
    const h = new NavHistory();
    for (const url of ["/", "/todos", "/todos/1"]) h.visit(url);
    expect(h.canForward).toBe(false);
    expect(h.back()).toBe("/todos");
    h.visit("/todos"); // the router reports the URL the traversal went to
    expect(h.canForward).toBe(true);
    expect(h.back()).toBe("/");
    h.visit("/");
    expect(h.canBack).toBe(false);
    expect(h.back()).toBeNull();
    expect(h.forward()).toBe("/todos");
    h.visit("/todos");
    expect(h.entries).toEqual(["/", "/todos", "/todos/1"]);
  });

  it("drops the forward entries on a new URL, ignores repeats, and keeps at most MAX", () => {
    const h = new NavHistory();
    h.visit("/a");
    h.visit("/a");
    h.visit("/b");
    h.back();
    h.visit("/a");
    h.visit("/c");
    expect(h.entries).toEqual(["/a", "/c"]);
    for (let i = 0; i < NavHistory.MAX + 10; i++) h.visit(`/p${i}`);
    expect(h.entries.length).toBe(NavHistory.MAX);
    expect(h.index).toBe(NavHistory.MAX - 1);
  });
});

describe("polish: drop placement, text scale and labels", () => {
  const rect = { top: 100, height: 40 };
  it("drops before, inside or after an element by where the pointer is", () => {
    expect(dropWhere(rect, 105, true)).toBe("before");
    expect(dropWhere(rect, 120, true)).toBe("last");
    expect(dropWhere(rect, 135, true)).toBe("after");
    expect(dropWhere(rect, 115, false)).toBe("before");
    expect(dropWhere(rect, 125, false)).toBe("after");
    expect(dropWhere({ top: 0, height: 0 }, 0, true)).toBe("last");
  });

  it("clamps the text scale and keeps settings without one unchanged", () => {
    expect(clampTextScale(1.15)).toBe(1.15);
    expect(clampTextScale("1.333")).toBe(1.33);
    expect(clampTextScale(9)).toBe(3);
    expect(clampTextScale(0.1)).toBe(0.5);
    expect(clampTextScale("x")).toBe(1);
    expect(clampTextScale(undefined)).toBe(1);
    const frame = (emulation: object) => ({ frames: [{ id: "f", name: "F", width: 400, height: 800, dpr: 1, landscape: false, presetId: null, emulation }] });
    expect(sanitizeSettings(frame({ textScale: 1.3 })).frames?.[0]?.emulation.textScale).toBe(1.3);
    expect(sanitizeSettings(frame({ textScale: 1 })).frames?.[0]?.emulation).not.toHaveProperty("textScale");
  });

  it("labels an element by its tag and first static class", () => {
    expect(elementLabel("li", "todo row")).toBe("li.todo");
    expect(elementLabel("li", "  ")).toBe("li");
    expect(elementLabel("div", null)).toBe("div");
    expect(elementLabel("p", "{{ cls() }}")).toBe("p");
  });
});
