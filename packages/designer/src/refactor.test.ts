// Refactors from the canvas (TASK-56.24): find uses, rename a component across the project, and extract with props. All of them
// are minimal text patches through the EditService; a rename touches several files and undoes as one step.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTemplateTree } from "@gable/template-format";
import { describe, expect, it } from "vitest";
import { EditService } from "./server/edit/service.js";
import { elementsOf } from "./server/edit/template.js";
import type { EditResult, TargetRef } from "./server/edit/types.js";

const ok = (r: EditResult) => {
  if (!r.ok) throw new Error(`${r.code}: ${r.error}`);
  return r;
};

const FILES: Record<string, string> = {
  "src/todo-item.ts": `import { html, input } from '@gable/core';

export class TodoItem {
  static meta = {
    selector: 'app-todo-item',
    host: { '[class.completed]': 'done()' },
    template: html\`
      <li class="item completed">{{ title() }}</li>
    \`,
  };
  title = input.required<string>();
  done = input(false);
}
`,
  "src/todo-app.ts": `import { html, signal } from '@gable/core';
import { TodoItem } from './todo-item.js';
import type { Todo } from './todo.js';

// TodoItem is the row component
export class TodoApp {
  static meta = {
    selector: 'app-todo-app',
    imports: [TodoItem],
    template: html\`
      <ul class="list">
        <app-todo-item></app-todo-item>
        <app-todo-item></app-todo-item>
      </ul>
    \`,
  };
  label = 'TodoItem';
  count = signal(0);
}
`,
  "src/index.ts": `export { TodoItem } from './todo-item.js';
export { TodoApp } from './todo-app.js';
`,
  "src/consumer.ts": `import { TodoItem as Row } from './index.js';

export const rows = [Row];
export const shorthand = { Row };
`,
  "src/barrel-user.ts": `import { TodoItem } from './index.js';

export const items = { TodoItem };
export const make = () => new TodoItem();
`,
  "src/unrelated.ts": `export class TodoItem {
  static other = true;
}
`,
  "src/todo-item.scenes.ts": `import { TodoItem } from './todo-item.js';

export default { component: TodoItem, scenes: {} };
`,
  "src/styles.css": `/* app-todo-item is a block */
app-todo-item { display: block; }
.completed { opacity: 0.5; }
li.completed::after { content: ''; }
`,
};

function project(extra: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "gable-refactor-"));
  mkdirSync(join(root, "src"));
  for (const [f, text] of Object.entries({ ...FILES, ...extra })) writeFileSync(join(root, f), text);
  const read = (f: string) => readFileSync(join(root, f), "utf8");
  const snapshot = () => Object.fromEntries(Object.keys({ ...FILES, ...extra }).map((f) => [f, read(f)]));
  return { root, svc: new EditService(root), read, snapshot };
}

describe("find uses", () => {
  it("finds every use of a component: declaration, imports, the imports list and templates", () => {
    const p = project();
    const r = p.svc.findUses({ kind: "component", name: "TodoItem", file: "src/todo-item.ts" });
    if (!r.ok) throw new Error(r.error);
    expect(r.declaration).toMatchObject({ file: "src/todo-item.ts", selector: "app-todo-item" });
    const by = (k: string) => r.uses.filter((u) => u.kind === k).map((u) => `${u.file}:${u.line}`);
    expect(by("declaration")).toEqual(["src/todo-item.ts:3"]);
    expect(by("import")).toContain("src/todo-app.ts:2");
    expect(by("imports")).toEqual(["src/todo-app.ts:9"]);
    expect(by("template")).toEqual(["src/todo-app.ts:12", "src/todo-app.ts:13"]);
    // the unrelated class of the same name and the string/comment mentions are not uses
    expect(r.uses.some((u) => u.file === "src/unrelated.ts")).toBe(false);
    expect(r.uses.some((u) => u.line === 5 && u.file === "src/todo-app.ts")).toBe(false);
    expect(r.uses.every((u) => u.line > 0 && u.column > 0 && u.text.length > 0)).toBe(true);
  });

  it("says when a class name is declared twice and which one is meant", () => {
    const p = project();
    const r = p.svc.findUses({ kind: "component", name: "TodoItem" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ambiguous");
  });

  it("finds a CSS class in templates, bindings, host and stylesheets", () => {
    const p = project();
    const r = p.svc.findUses({ kind: "class", name: "completed" });
    if (!r.ok) throw new Error(r.error);
    const kinds = r.uses.map((u) => `${u.kind}@${u.file}:${u.line}`);
    expect(kinds).toContain("class-attr@src/todo-item.ts:8");
    expect(kinds).toContain("host-binding@src/todo-item.ts:6");
    expect(kinds).toContain("css@src/styles.css:3");
    expect(kinds).toContain("css@src/styles.css:4");
    expect(r.uses.filter((u) => u.kind === "css")).toHaveLength(2);
  });

  it("finds a [class.x] binding on an element", () => {
    const p = project({ "src/b.ts": "import { html } from '@gable/core';\nexport class B { static meta = { selector: 'app-b', template: html`<p [class.on]=\"x()\" class=\"a on\">x</p>` }; }\n" });
    const r = p.svc.findUses({ kind: "class", name: "on" });
    if (!r.ok) throw new Error(r.error);
    expect(r.uses.map((u) => u.kind).sort()).toEqual(["class-attr", "class-binding"]);
  });
});

describe("rename component", () => {
  it("renames the class in the declaration, imports, imports list, barrel and scenes, and leaves the rest", () => {
    const p = project();
    const before = p.snapshot();
    const r = ok(p.svc.apply({ op: "renameComponent", from: "TodoItem", to: "TodoRow", file: "src/todo-item.ts" }));
    expect(r.label).toBe("Rename TodoItem to TodoRow");
    expect(r.changed).toEqual(expect.arrayContaining(["src/todo-item.ts", "src/todo-app.ts", "src/index.ts", "src/consumer.ts", "src/barrel-user.ts", "src/todo-item.scenes.ts"]));
    expect(p.read("src/todo-item.ts")).toContain("export class TodoRow {");
    expect(p.read("src/todo-app.ts")).toContain("import { TodoRow } from './todo-item.js';");
    expect(p.read("src/todo-app.ts")).toContain("imports: [TodoRow],");
    expect(p.read("src/todo-app.ts")).toContain("// TodoItem is the row component");
    expect(p.read("src/todo-app.ts")).toContain("label = 'TodoItem';");
    expect(p.read("src/index.ts")).toContain("export { TodoRow } from './todo-item.js';");
    // an aliased import keeps its local name
    expect(p.read("src/consumer.ts")).toContain("import { TodoRow as Row } from './index.js';");
    expect(p.read("src/consumer.ts")).toContain("[Row]");
    expect(p.read("src/barrel-user.ts")).toContain("items = { TodoItem: TodoRow }");
    expect(p.read("src/barrel-user.ts")).toContain("new TodoRow()");
    expect(p.read("src/todo-item.scenes.ts")).toContain("component: TodoRow");
    // an unrelated class with the same name, and the selector, are untouched
    expect(p.read("src/unrelated.ts")).toBe(before["src/unrelated.ts"]);
    expect(p.read("src/todo-app.ts")).toContain("<app-todo-item></app-todo-item>");
    expect(r.note).toMatch(/other mentions? of TodoItem/);
  });

  it("is one history entry: one undo restores every file byte for byte, redo renames again", () => {
    const p = project();
    const before = p.snapshot();
    ok(p.svc.apply({ op: "renameComponent", from: "TodoItem", to: "TodoRow", file: "src/todo-item.ts" }));
    const after = p.snapshot();
    expect(p.svc.history().undo).toHaveLength(1);
    expect(p.svc.history().undo[0]!.files!.length).toBeGreaterThanOrEqual(5);
    ok(p.svc.undo());
    expect(p.snapshot()).toEqual(before);
    ok(p.svc.redo());
    expect(p.snapshot()).toEqual(after);
  });

  it("also renames the selector in the meta, every template and the stylesheet, as one step", () => {
    const p = project();
    const before = p.snapshot();
    const r = ok(p.svc.apply({ op: "renameComponent", from: "TodoItem", to: "TodoRow", file: "src/todo-item.ts", selector: "app-todo-row" }));
    expect(r.label).toContain("2 template uses");
    expect(p.read("src/todo-item.ts")).toContain("selector: 'app-todo-row',");
    expect(p.read("src/todo-app.ts")).toContain("<app-todo-row></app-todo-row>");
    expect(p.read("src/todo-app.ts")).not.toContain("<app-todo-item");
    expect(p.read("src/styles.css")).toContain("app-todo-row { display: block; }");
    expect(p.read("src/styles.css")).toContain("/* app-todo-item is a block */");
    expect(p.svc.palette().find((e) => e.component?.name === "TodoRow")?.selector).toBe("app-todo-row");
    ok(p.svc.undo());
    expect(p.snapshot()).toEqual(before);
  });

  it("renames an attribute selector (li[app-x]) on its elements", () => {
    const p = project({
      "src/row.ts": "import { html } from '@gable/core';\nexport class Row { static meta = { selector: 'li[app-row]', template: html`<span>r</span>` }; }\n",
      "src/list.ts": "import { html } from '@gable/core';\nimport { Row } from './row.js';\nexport class List { static meta = { selector: 'app-list', imports: [Row], template: html`<ul><li app-row></li><li app-row class=\"x\"></li></ul>` }; }\n",
    });
    ok(p.svc.apply({ op: "renameComponent", from: "Row", to: "Line", selector: "li[app-line]" }));
    expect(p.read("src/list.ts")).toContain('<li app-line></li><li app-line class="x"></li>');
    expect(p.read("src/row.ts")).toContain("selector: 'li[app-line]'");
    expect(p.read("src/list.ts")).toContain("imports: [Line]");
  });

  it("keeps CRLF files CRLF", () => {
    const p = project({ "src/crlf.ts": "import { TodoItem } from './todo-item.js';\r\nexport const x = TodoItem;\r\n" });
    ok(p.svc.apply({ op: "renameComponent", from: "TodoItem", to: "TodoRow", file: "src/todo-item.ts" }));
    expect(p.read("src/crlf.ts")).toBe("import { TodoRow } from './todo-item.js';\r\nexport const x = TodoRow;\r\n");
  });

  it("refuses a name that is taken, a bad name, an unknown class, an ambiguous class and a changed selector shape", () => {
    const p = project();
    const bad = (op: Parameters<EditService["apply"]>[0]) => {
      const r = p.svc.apply(op);
      expect(r.ok).toBe(false);
      return r as Extract<EditResult, { ok: false }>;
    };
    expect(bad({ op: "renameComponent", from: "TodoItem", to: "TodoApp", file: "src/todo-item.ts" }).code).toBe("invalid");
    expect(bad({ op: "renameComponent", from: "TodoItem", to: "todo row", file: "src/todo-item.ts" }).code).toBe("invalid");
    expect(bad({ op: "renameComponent", from: "Nope", to: "Other" }).code).toBe("missing");
    expect(bad({ op: "renameComponent", from: "TodoItem", to: "TodoRow" }).code).toBe("ambiguous");
    expect(bad({ op: "renameComponent", from: "TodoItem", to: "TodoRow", file: "src/todo-item.ts", selector: "li[app-todo-row]" }).code).toBe("invalid");
    expect(bad({ op: "renameComponent", from: "TodoItem", to: "TodoRow", file: "src/todo-item.ts", selector: "app-todo-app" }).code).toBe("invalid");
    expect(p.svc.history().undo).toHaveLength(0);
  });

  it("refuses the whole undo when one of the files was edited since (nothing is half undone)", () => {
    const p = project();
    ok(p.svc.apply({ op: "renameComponent", from: "TodoItem", to: "TodoRow", file: "src/todo-item.ts" }));
    // someone rewrites the line the reverse patch needs
    writeFileSync(join(p.root, "src/index.ts"), "export const nothing = 1;\n");
    const mid = p.snapshot();
    const r = p.svc.undo();
    expect(r.ok).toBe(false);
    expect(p.snapshot()).toEqual(mid);
  });
});

describe("extract with props", () => {
  const SRC = `import { html, signal, computed } from '@gable/core';

export class TodoApp {
  static meta = {
    selector: 'app-todo-app',
    template: html\`
      <main>
        <section class="card" [class.done]="finished()">
          <h2>{{ title() }}</h2>
          <p [title]="hint()">Hello</p>
        </section>
      </main>
    \`,
  };
  title = signal<string>('Todo');
  hint = signal('x');
  finished = computed<boolean>(() => false);
}
`;
  const target = (src: string, tag: string): TargetRef => {
    const lit = /html`([\s\S]*?)`/.exec(src)!;
    const body = lit[1]!;
    const e = elementsOf(parseTemplateTree(body)).find((x) => x.el.name === tag)!;
    return { raw: body, start: e.el.start, tag, modulePath: "src/todo-app.ts" };
  };
  const setup = (src = SRC) => {
    const root = mkdtempSync(join(tmpdir(), "gable-props-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/todo-app.ts"), src);
    return { root, svc: new EditService(root), read: (f: string) => readFileSync(join(root, f), "utf8") };
  };

  it("reports signal reads that could become inputs, and keeps refusing them without props", () => {
    const p = setup();
    const m = p.svc.describe(target(SRC, "section"));
    if (!m.ok) throw new Error(m.error);
    expect(m.extract).toMatchObject({ ok: false, withProps: { props: ["finished", "title", "hint"] } });
    const r = p.svc.apply({ op: "extract", target: target(SRC, "section"), name: "InfoCard" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Extract with props/);
  });

  it("moves the markup, adds an input per read, binds them at the use and undoes over both files", () => {
    const p = setup();
    const r = ok(p.svc.apply({ op: "extract", target: target(SRC, "section"), name: "InfoCard", props: true }));
    expect(r.created).toEqual(["src/info-card.ts"]);
    const made = p.read("src/info-card.ts");
    expect(made).toContain("import { html, input } from '@gable/core';");
    expect(made).toContain("finished = input.required<boolean>();");
    expect(made).toContain("title = input.required<string>();");
    expect(made).toContain("hint = input.required<unknown>();");
    expect(made).toContain("{{ title() }}");
    expect(made).toContain('[class.done]="finished()"');
    expect(p.read("src/todo-app.ts").replace(/\s+/g, " ")).toContain('<app-info-card [finished]="finished()" [title]="title()" [hint]="hint()" ></app-info-card>');
    expect(p.read("src/todo-app.ts")).toContain("imports: [InfoCard]");
    expect(r.note).toMatch(/hint is typed unknown/);
    ok(p.svc.undo());
    expect(p.read("src/todo-app.ts")).toBe(SRC);
    expect(existsSync(join(p.root, "src/info-card.ts"))).toBe(false);
    ok(p.svc.redo());
    expect(existsSync(join(p.root, "src/info-card.ts"))).toBe(true);
  });

  it("still refuses events, blocks and expressions that are not plain reads, even with props", () => {
    const src = SRC.replace("<h2>{{ title() }}</h2>", '<h2>{{ title() + 1 }}</h2>');
    const p = setup(src);
    const r = p.svc.apply({ op: "extract", target: target(src, "section"), name: "InfoCard", props: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not a plain signal read/);
    const ev = SRC.replace("<p [title]", '<p (click)="go()" [title]');
    const q = setup(ev);
    const r2 = q.svc.apply({ op: "extract", target: target(ev, "section"), name: "InfoCard", props: true });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/event handler/);
    const blk = SRC.replace("<h2>", "@if (finished()) { <h2>").replace("</h2>", "</h2> }");
    const q2 = setup(blk);
    expect(q2.svc.apply({ op: "extract", target: target(blk, "section"), name: "InfoCard", props: true }).ok).toBe(false);
  });

  it("props on static markup is the plain extract", () => {
    const staticSrc = SRC.replace("{{ title() }}", "T").replace(' [title]="hint()"', "").replace(' [class.done]="finished()"', "");
    const p = setup(staticSrc);
    const r = ok(p.svc.apply({ op: "extract", target: target(staticSrc, "section"), name: "Plain", props: true }));
    expect(r.created).toEqual(["src/plain.ts"]);
    expect(p.read("src/plain.ts")).toContain("import { html } from '@gable/core';");
  });
});
