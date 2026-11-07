// The Scenario writer and Extract component (TASK-56.10): both are minimal text patches through the EditService, and undo is
// the reverse patch (for extract, over two files, one of them created).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatTemplateLiterals, parseTemplateTree } from "@gable/template-format";
import { describe, expect, it } from "vitest";
import { readSceneFile } from "./server/scene-index.js";
import { EditService } from "./server/edit/service.js";
import { kebab } from "./server/edit/extract.js";
import { elementsOf } from "./server/edit/template.js";
import type { EditResult, TargetRef } from "./server/edit/types.js";

const ok = (r: EditResult) => {
  if (!r.ok) throw new Error(`${r.code}: ${r.error}`);
  return r;
};

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "gable-writers-"));
  mkdirSync(join(root, "src"));
  return root;
}

// --- Scenarios ------------------------------------------------------------------------------------------------------

const SCENES = `import type { ComponentScenes } from '@gable/core/tooling';
import { TodoItem } from './todo-item.js';

const providers = [];

export default {
  component: TodoItem,
  scenes: {
    Active: { description: 'An open todo', inputs: { todo: { id: '1', title: 'Buy milk', completed: false } }, providers },
    Completed: {
      description: 'A finished todo',
      inputs: { todo: { id: '2', title: 'Walk the dog', completed: true } },
      providers,
    },
  },
} satisfies ComponentScenes<TodoItem>;
`;

function scenes(source: string, eol = "\n") {
  const root = tempRoot();
  const file = join(root, "src", "todo-item.scenes.ts");
  writeFileSync(file, source.replaceAll("\n", eol));
  return { root, file, svc: new EditService(root), text: () => readFileSync(file, "utf8"), names: () => readSceneFile("/src/todo-item.scenes.ts", readFileSync(file, "utf8")).scenes.map((s) => s.name) };
}

describe("Scenario writer", () => {
  it("appends a scene after the last one as one insertion, and undo restores the file byte for byte", () => {
    const s = scenes(SCENES);
    const r = ok(s.svc.apply({ op: "addScene", file: "/src/todo-item.scenes.ts", name: "Empty", description: "Nothing yet" }));
    expect(r.label).toBe('Add Scenario "Empty"');
    expect(r.file).toBe("src/todo-item.scenes.ts");
    expect(s.text()).toBe(SCENES.replace("      providers,\n    },\n  },", "      providers,\n    },\n    Empty: { description: 'Nothing yet' },\n  },"));
    expect(s.names()).toEqual(["Active", "Completed", "Empty"]);
    ok(s.svc.undo());
    expect(s.text()).toBe(SCENES);
    ok(s.svc.redo());
    expect(s.names()).toEqual(["Active", "Completed", "Empty"]);
  });

  it("copies another scene's definition with the new description, and quotes names that are not identifiers", () => {
    const s = scenes(SCENES);
    ok(s.svc.apply({ op: "addScene", file: "/src/todo-item.scenes.ts", name: "Long title", description: "It's long", from: "Active" }));
    expect(s.text()).toContain(`    'Long title': { description: 'It\\'s long', inputs: { todo: { id: '1', title: 'Buy milk', completed: false } }, providers },\n  },`);
    ok(s.svc.apply({ op: "addScene", file: "/src/todo-item.scenes.ts", name: "Done copy", from: "Completed" }));
    // No description given: the copy's description is removed, not left saying what the original is.
    expect(s.text()).toContain(`    'Done copy': {\n      inputs: { todo: { id: '2', title: 'Walk the dog', completed: true } },\n      providers,\n    },\n  },`);
    expect(s.names()).toEqual(["Active", "Completed", "Long title", "Done copy"]);
    expect(readSceneFile("/x", s.text()).scenes.find((x) => x.name === "Long title")!.description).toBe("It's long");
  });

  it("adds to single-line and empty scenes objects, and keeps CRLF files CRLF", () => {
    const one = scenes(`export default { component: X, scenes: { A: {} } };\n`);
    ok(one.svc.apply({ op: "addScene", file: "/src/todo-item.scenes.ts", name: "B" }));
    expect(one.text()).toBe(`export default { component: X, scenes: { A: {}, B: {} } };\n`);

    const empty = scenes(`export default {\n  component: X,\n  scenes: {},\n};\n`);
    ok(empty.svc.apply({ op: "addScene", file: "/src/todo-item.scenes.ts", name: "First", description: "One" }));
    expect(empty.text()).toBe(`export default {\n  component: X,\n  scenes: {\n    First: { description: 'One' },\n  },\n};\n`);

    const crlf = scenes(SCENES, "\r\n");
    ok(crlf.svc.apply({ op: "addScene", file: "/src/todo-item.scenes.ts", name: "Empty" }));
    expect(crlf.text()).toBe(SCENES.replaceAll("\n", "\r\n").replace("    },\r\n  },", "    },\r\n    Empty: {},\r\n  },"));
  });

  it("refuses duplicates, unsafe names, computed scenes and files that are not scenes files", () => {
    const s = scenes(SCENES);
    const refuse = (op: Parameters<EditService["apply"]>[0]) => {
      const r = s.svc.apply(op);
      expect(r.ok).toBe(false);
      return r.ok ? "" : r.error;
    };
    expect(refuse({ op: "addScene", file: "/src/todo-item.scenes.ts", name: "Active" })).toMatch(/already/);
    expect(refuse({ op: "addScene", file: "/src/todo-item.scenes.ts", name: "a`b" })).toMatch(/backtick/);
    expect(refuse({ op: "addScene", file: "/src/todo-item.scenes.ts", name: " " })).toMatch(/Name/);
    expect(refuse({ op: "addScene", file: "/src/todo-item.scenes.ts", name: "X", from: "Nope" })).toMatch(/Nope/);
    expect(refuse({ op: "addScene", file: "/src/todo-item.ts", name: "X" })).toMatch(/scenes\.ts/);
    expect(refuse({ op: "addScene", file: "/../outside.scenes.ts", name: "X" })).toBeTruthy();
    expect(s.text()).toBe(SCENES);
    const computed = scenes(`export default { component: X, scenes: build() };\n`);
    expect(computed.svc.apply({ op: "addScene", file: "/src/todo-item.scenes.ts", name: "X" })).toMatchObject({ ok: false, code: "readonly" });
  });
});

// --- Extract component ------------------------------------------------------------------------------------------------

const PAGE = `import { html, signal } from '@gable/core';
import { Badge } from './badge.js';

export class Shop {
  static meta = {
    selector: 'app-shop',
    imports: [Badge],
    template: html\`
      <section class="grid">
        <div class="card">
          <h2 class="title">Lamp</h2>
          <app-badge></app-badge>
        </div>
        <div class="card">
          <h2 class="title">Lamp</h2>
          <app-badge></app-badge>
        </div>
        <p (click)="buy()">{{ total() }}</p>
      </section>
    \`,
  };
  total = signal(0);
  buy(): void {}
}
`;

const BADGE = `import { html } from '@gable/core';

export class Badge {
  static meta = { selector: 'app-badge', template: html\`<span>New</span>\` };
}
`;

function shop(source = PAGE) {
  const root = tempRoot();
  const file = join(root, "src", "shop.ts");
  writeFileSync(file, source);
  writeFileSync(join(root, "src", "badge.ts"), BADGE);
  const svc = new EditService(root);
  const body = () => /html`([\s\S]*?)`/.exec(readFileSync(file, "utf8"))![1]!;
  const target = (tag: string, nth = 0): TargetRef => {
    const raw = body();
    const els = elementsOf(parseTemplateTree(raw)).filter((e) => e.el.name === tag);
    return { raw, start: els[nth]!.el.start, tag, file: "src/shop.ts" };
  };
  const created = join(root, "src", "product-card.ts");
  return { root, file, svc, body, target, created, text: () => readFileSync(file, "utf8"), createdText: () => readFileSync(created, "utf8") };
}

describe("Extract component", () => {
  it("names files and selectors in kebab case", () => {
    expect(kebab("ProductCard")).toBe("product-card");
    expect(kebab("HTMLCard")).toBe("html-card");
    expect(kebab("Card2")).toBe("card2");
  });

  it("says before anything is tried whether an element can be extracted and how many copies the template has", () => {
    const s = shop();
    const card = s.svc.describe(s.target("div"));
    if (!card.ok) throw new Error(card.error);
    expect(card.extract).toEqual({ ok: true, copies: 2 });
    const p = s.svc.describe(s.target("p"));
    if (!p.ok) throw new Error(p.error);
    expect(p.extract).toMatchObject({ ok: false });
    expect(p.extract!.ok === false && p.extract!.why).toMatch(/\(click\)/);
    const section = s.svc.describe(s.target("section"));
    expect(section.ok && section.extract!.ok).toBe(false);
  });

  it("creates the component file, uses it in place, and undo is one reverse patch over both files", () => {
    const s = shop();
    const r = ok(s.svc.apply({ op: "extract", target: s.target("div"), name: "ProductCard" }));
    expect(r.label).toBe("Extract ProductCard");
    expect(r.created).toEqual(["src/product-card.ts"]);
    expect(s.createdText()).toBe(`import { html } from '@gable/core';
import { Badge } from './badge.js';

export class ProductCard {
  static meta = {
    selector: 'app-product-card',
    imports: [Badge],
    template: html\`
      <div class="card">
        <h2 class="title">Lamp</h2>
        <app-badge></app-badge>
      </div>
    \`,
  };
}
`);
    expect(formatTemplateLiterals(s.createdText())).toBe(s.createdText());
    const text = s.text();
    expect(text).toContain("import { ProductCard } from './product-card.js';");
    expect(text).toContain("imports: [Badge, ProductCard],");
    expect(text).toContain('      <section class="grid">\n        <app-product-card></app-product-card>\n        <div class="card">');
    expect(formatTemplateLiterals(text)).toBe(text);
    // The new element is selected after HMR.
    expect(r.select && r.select.raw.slice(r.select.offset).startsWith("<app-product-card>")).toBe(true);
    expect(s.svc.history().undo.at(-1)).toMatchObject({ label: "Extract ProductCard", file: "src/shop.ts", files: ["src/shop.ts", "src/product-card.ts"] });

    ok(s.svc.undo());
    expect(s.text()).toBe(PAGE);
    expect(existsSync(s.created)).toBe(false);
    ok(s.svc.redo());
    expect(s.text()).toBe(text);
    expect(formatTemplateLiterals(s.createdText())).toBe(s.createdText());
  });

  it("replaces every identical copy when asked", () => {
    const s = shop();
    const r = ok(s.svc.apply({ op: "extract", target: s.target("div", 1), name: "ProductCard", all: true }));
    expect(r.label).toBe("Extract ProductCard (2 places)");
    expect(s.body().match(/<app-product-card><\/app-product-card>/g)).toHaveLength(2);
    expect(s.body()).not.toContain('<div class="card">');
    ok(s.svc.undo());
    expect(s.text()).toBe(PAGE);
  });

  it("refuses dynamic markup, unknown custom elements, taken names and existing files, writing nothing", () => {
    const s = shop();
    const refuse = (op: Parameters<EditService["apply"]>[0]) => {
      const r = s.svc.apply(op);
      expect(r.ok).toBe(false);
      return r.ok ? "" : r.error;
    };
    expect(refuse({ op: "extract", target: s.target("p"), name: "Total" })).toMatch(/static markup/);
    expect(refuse({ op: "extract", target: s.target("div"), name: "productCard" })).toMatch(/PascalCase/);
    expect(refuse({ op: "extract", target: s.target("div"), name: "Shop" })).toMatch(/already/);
    expect(refuse({ op: "extract", target: s.target("div"), name: "Badge" })).toMatch(/already/);
    writeFileSync(join(s.root, "src", "lamp.ts"), "");
    expect(refuse({ op: "extract", target: s.target("div"), name: "Lamp" })).toMatch(/already exists/);
    expect(s.text()).toBe(PAGE);
    expect(s.svc.history().undo).toHaveLength(0);

    const unknown = shop(PAGE.replaceAll("<app-badge></app-badge>", "<x-rating></x-rating>"));
    expect(unknown.svc.apply({ op: "extract", target: unknown.target("div"), name: "ProductCard" })).toMatchObject({ ok: false, error: expect.stringMatching(/x-rating/) });
    expect(existsSync(unknown.created)).toBe(false);
  });

  it("says when scoped styles stay behind", () => {
    const s = shop(PAGE.replace("selector: 'app-shop',", "selector: 'app-shop',\n    styles: '.card { color: red }',"));
    const r = ok(s.svc.apply({ op: "extract", target: s.target("div"), name: "ProductCard" }));
    expect(r.note).toMatch(/scoped styles/);
  });

  it("refuses undo, and writes nothing, when the new component was edited since", () => {
    const s = shop();
    ok(s.svc.apply({ op: "extract", target: s.target("div"), name: "ProductCard" }));
    const source = s.text();
    const edited = s.createdText().replace("Lamp", "Desk lamp");
    writeFileSync(s.created, edited);
    s.svc.noteFileChanged(s.created);
    expect(s.svc.history().external).toContain("src/product-card.ts");
    const r = s.svc.undo();
    expect(r).toMatchObject({ ok: false, code: "conflict" });
    expect(s.text()).toBe(source);
    expect(s.createdText()).toBe(edited);
  });
});
