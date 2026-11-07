import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatTemplateLiterals, parseTemplateTree } from "@gable/template-format";
import { describe, expect, it } from "vitest";
import { setCssDeclaration } from "./server/edit/css.js";
import { applyHunks } from "./server/edit/hunks.js";
import { buildPalette, snippetFor } from "./server/edit/palette.js";
import { EditService } from "./server/edit/service.js";
import { elementsOf } from "./server/edit/template.js";
import type { EditResult, TargetRef } from "./server/edit/types.js";

const TPL = (body: string) => `import { html } from "@gable/core";
import { signal } from "@gable/core";

export class Counter {
  static meta = {
    selector: "app-counter",
    imports: [],
    template: html\`${body}\`,
  };
  count = signal(0);
}
`;

const CLEAN = "\n      <div class=\"box\">\n        <button (click)=\"inc()\" [disabled]=\"count() > 3\">Add</button>\n        <span>{{ count() }}</span>\n      </div>\n    ";

function project(source: string, eol = "\n") {
  const root = mkdtempSync(join(tmpdir(), "gable-edit-"));
  mkdirSync(join(root, "src"));
  const file = join(root, "src", "counter.ts");
  writeFileSync(file, source.replaceAll("\n", eol));
  const svc = new EditService(root);
  const body = () => /html`([\s\S]*?)`/.exec(readFileSync(file, "utf8").replaceAll("\r\n", "\n"))![1]!;
  const target = (tag: string, nth = 0, raw = body()): TargetRef => {
    const els = elementsOf(parseTemplateTree(raw)).filter((e) => e.el.name === tag);
    return { raw, start: els[nth]!.el.start, tag, file: "src/counter.ts" };
  };
  return { root, file, svc, body, target, text: () => readFileSync(file, "utf8") };
}

const ok = (r: EditResult) => {
  if (!r.ok) throw new Error(`${r.code}: ${r.error}`);
  return r;
};

describe("write-back: template edits", () => {
  it("describes static attributes as editable and dynamic bindings as read-only", () => {
    const p = project(TPL(CLEAN));
    const m = p.svc.describe(p.target("button"));
    if (!m.ok) throw new Error(m.error);
    const byName = Object.fromEntries(m.attrs.map((a) => [a.name, a]));
    expect(byName["(click)"]!.editable).toBe(false);
    expect(byName["[disabled]"]!.editable).toBe(false); // an expression, not a plain signal read
    const span = p.svc.describe(p.target("span"));
    if (!span.ok) throw new Error(span.error);
    expect(span.text[0]!.dynamic).toBe(1);
  });

  it("sets text, keeping the formatter's output and leaving everything else byte-identical", () => {
    const p = project(TPL(CLEAN));
    const before = p.text();
    ok(p.svc.apply({ op: "setText", target: p.target("button"), run: 0, text: "Plus one" }));
    const after = p.text();
    expect(after).toBe(before.replace(">Add<", ">Plus one<"));
    expect(formatTemplateLiterals(after)).toBe(after);
  });

  it("refuses text edits that would drop or reorder a {{ }} interpolation", () => {
    const p = project(TPL(CLEAN));
    const r = p.svc.apply({ op: "setText", target: p.target("span"), run: 0, text: "none" });
    expect(r.ok).toBe(false);
    expect(p.text()).toBe(TPL(CLEAN));
  });

  it("sets and removes a static attribute", () => {
    const p = project(TPL(CLEAN));
    ok(p.svc.apply({ op: "setAttr", target: p.target("div"), name: "class", value: "card" }));
    expect(p.text()).toContain('<div class="card">');
    ok(p.svc.apply({ op: "setAttr", target: p.target("div"), name: "id", value: "x" }));
    expect(p.text()).toContain('id="x"');
    ok(p.svc.apply({ op: "removeAttr", target: p.target("div"), name: "id" }));
    expect(p.text()).not.toContain('id="x"');
  });

  it("never rewrites an event handler or an opaque binding", () => {
    const p = project(TPL(CLEAN));
    const before = p.text();
    expect(p.svc.apply({ op: "removeAttr", target: p.target("button"), name: "(click)" }).ok).toBe(false);
    expect(p.svc.apply({ op: "removeAttr", target: p.target("button"), name: "[disabled]" }).ok).toBe(false);
    expect(p.svc.apply({ op: "setAttr", target: p.target("button"), name: "(click)", value: "x()" }).ok).toBe(false);
    expect(p.text()).toBe(before);
  });

  it("binds a property to a signal and adds a text binding", () => {
    const p = project(TPL(CLEAN));
    ok(p.svc.apply({ op: "setBinding", target: p.target("div"), kind: "class", name: "active", expr: "count()" }));
    expect(p.text()).toMatch(/\[class\.active\]="count\(\)"/);
    ok(p.svc.apply({ op: "addTextBinding", target: p.target("div"), expr: "count()" }));
    expect(p.text()).toContain("{{ count() }}");
    expect(p.svc.apply({ op: "setBinding", target: p.target("div"), kind: "prop", name: "title", expr: "a + b" }).ok).toBe(false);
  });

  it("inserts, wraps, moves and deletes", () => {
    const p = project(TPL(CLEAN));
    ok(p.svc.apply({ op: "insert", target: p.target("div"), where: "last", snippet: "<p>Hi</p>" }));
    expect(p.body()).toContain("<p>Hi</p>");
    expect(formatTemplateLiterals(p.text())).toBe(p.text());

    ok(p.svc.apply({ op: "wrap", target: p.target("p"), with: { kind: "if", cond: "count()" } }));
    expect(p.body()).toMatch(/@if \(count\(\)\) \{/);

    ok(p.svc.apply({ op: "move", target: p.target("span"), to: p.target("button"), where: "before" }));
    expect(p.body().indexOf("<span>")).toBeLessThan(p.body().indexOf("<button"));

    ok(p.svc.apply({ op: "delete", target: p.target("span") }));
    expect(p.body()).not.toContain("<span>");
    expect(formatTemplateLiterals(p.text())).toBe(p.text());
  });

  it("wraps in @for", () => {
    const p = project(TPL(CLEAN));
    ok(p.svc.apply({ op: "wrap", target: p.target("span"), with: { kind: "for", item: "item", source: "count()", track: "item" } }));
    expect(p.body().split("\n").map((l) => l.trim()).join(" ")).toContain("@for (item of count(); track item) { <span>");
    expect(formatTemplateLiterals(p.text())).toBe(p.text());
  });

  it("inserting a component imports it and lists it in the meta imports", () => {
    const p = project(TPL(CLEAN));
    writeFileSync(join(p.root, "src", "card.ts"), `export class Card { static meta = { selector: "app-card", template: "" }; }\n`);
    ok(p.svc.apply({ op: "insert", target: p.target("div"), where: "last", snippet: "<app-card></app-card>", component: { name: "Card", file: "src/card.ts" } }));
    const text = p.text();
    expect(text).toMatch(/import \{ Card \} from ['"]\.\/card(\.js)?['"]/);
    expect(text).toMatch(/imports: \[Card\]/);
  });

  it("a template that was not formatted is only touched where the edit is", () => {
    const messy = "\n  <div   class=\"a\"><b>x</b>\n\n\n<i>y</i></div>\n";
    const p = project(TPL(messy));
    const before = p.text();
    ok(p.svc.apply({ op: "setText", target: p.target("b"), run: 0, text: "z" }));
    expect(p.text()).toBe(before.replace(">x<", ">z<"));
  });

  it("refuses a stale handle", () => {
    const p = project(TPL(CLEAN));
    const t = p.target("button");
    ok(p.svc.apply({ op: "setText", target: t, run: 0, text: "Plus one" }));
    const r = p.svc.apply({ op: "setText", target: t, run: 0, text: "again" });
    expect(r.ok).toBe(false);
  });

  it("refuses templates with escapes, and keeps CRLF files CRLF", () => {
    const esc = project(TPL("\n  <p>a \\u00e9</p>\n"));
    expect(esc.svc.apply({ op: "setText", target: { raw: "\n  <p>a \\u00e9</p>\n", start: 3, tag: "p", file: "src/counter.ts" }, run: 0, text: "b" }).ok).toBe(false);

    const p = project(TPL(CLEAN), "\r\n");
    ok(p.svc.apply({ op: "insert", target: p.target("div"), where: "last", snippet: "<p>Hi</p>" }));
    const text = p.text();
    expect(text.replaceAll("\r\n", "")).not.toContain("\n");
    expect(text).toContain("<p>Hi</p>");
  });

  it("sets static meta strings and refuses code", () => {
    const p = project(TPL(CLEAN));
    ok(p.svc.apply({ op: "setMeta", target: p.target("div"), key: "selector", value: "app-count" }));
    expect(p.text()).toContain('selector: "app-count"');
    expect(p.svc.apply({ op: "setMeta", target: p.target("div"), key: "template", value: "x" }).ok).toBe(false);
  });
});

describe("write-back: undo and redo", () => {
  it("undoes and redoes as reverse patches", () => {
    const p = project(TPL(CLEAN));
    const original = p.text();
    ok(p.svc.apply({ op: "setText", target: p.target("button"), run: 0, text: "Plus" }));
    ok(p.svc.apply({ op: "setAttr", target: p.target("div"), name: "class", value: "card" }));
    const edited = p.text();
    ok(p.svc.undo());
    ok(p.svc.undo());
    expect(p.text()).toBe(original);
    ok(p.svc.redo());
    ok(p.svc.redo());
    expect(p.text()).toBe(edited);
    expect(p.svc.undo().ok).toBe(true);
    expect(p.svc.history().redo).toHaveLength(1);
  });

  it("detects an external edit, then relocates by context when the change is elsewhere", () => {
    const p = project(TPL(CLEAN));
    ok(p.svc.apply({ op: "setText", target: p.target("button"), run: 0, text: "Plus" }));
    // someone adds lines at the top of the file
    writeFileSync(p.file, "// header\n// more\n" + p.text());
    expect(p.svc.noteFileChanged(p.file)).toBe(true);
    expect(p.svc.history().external).toEqual(["src/counter.ts"]);
    const r = ok(p.svc.undo());
    expect(r.relocated).toBe(true);
    expect(p.text()).toBe("// header\n// more\n" + TPL(CLEAN));
  });

  it("reports a conflict, and writes nothing, when the edited text itself was changed", () => {
    const p = project(TPL(CLEAN));
    ok(p.svc.apply({ op: "setText", target: p.target("button"), run: 0, text: "Plus" }));
    const changed = p.text().replace(">Plus<", ">Other<");
    writeFileSync(p.file, changed);
    p.svc.noteFileChanged(p.file);
    const r = p.svc.undo();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("conflict");
    expect(p.text()).toBe(changed);
    expect(p.svc.history().undo).toHaveLength(1);
  });

  it("does not mistake its own writes for external edits", () => {
    const p = project(TPL(CLEAN));
    ok(p.svc.apply({ op: "setText", target: p.target("button"), run: 0, text: "Plus" }));
    expect(p.svc.noteFileChanged(p.file)).toBe(false);
    expect(p.svc.history().external).toEqual([]);
  });

  it("refuses files outside the project and in node_modules", () => {
    const p = project(TPL(CLEAN));
    expect(p.svc.apply({ op: "setText", target: { ...p.target("button"), file: "../x.ts" }, run: 0, text: "a" }).ok).toBe(false);
    mkdirSync(join(p.root, "node_modules"));
    writeFileSync(join(p.root, "node_modules", "a.ts"), TPL(CLEAN));
    expect(p.svc.apply({ op: "setText", target: { ...p.target("button"), file: "node_modules/a.ts" }, run: 0, text: "a" }).ok).toBe(false);
  });
});

describe("write-back: css and palette", () => {
  const css = "/* c */\n.a {\n  color: red;\n}\n\n@media (min-width: 1px) {\n  .z { color: blue; }\n}\n.b { margin: 0 }\n";
  const run = (sel: string, prop: string, value: string | null) => {
    const h = setCssDeclaration(css, sel, prop, value);
    if (!Array.isArray(h)) throw new Error(h.error);
    return applyHunks(css, h);
  };
  it("changes, adds and removes a declaration with minimal patches", () => {
    expect(run(".a", "color", "green")).toBe(css.replace("color: red", "color: green"));
    expect(run(".a", "padding", "4px")).toContain("  color: red;\n  padding: 4px;\n}");
    expect(run(".a", "color", null)).not.toContain("color: red");
    expect(run(".b", "margin", "1px")).toBe(css.replace("margin: 0", "margin: 1px"));
    expect(run(".c", "top", "0")).toMatch(/\n\.c \{\n {2}top: 0;\n\}\n$/);
  });
  it("rejects values that could break out of the declaration", () => {
    expect(Array.isArray(setCssDeclaration(css, ".a", "color", "red; } body {"))).toBe(false);
  });
  it("writes through the service and undoes", () => {
    const p = project(TPL(CLEAN));
    writeFileSync(join(p.root, "src", "a.css"), css);
    ok(p.svc.apply({ op: "setCss", file: "src/a.css", selector: ".a", property: "color", value: "green" }));
    expect(readFileSync(join(p.root, "src", "a.css"), "utf8")).toContain("color: green");
    ok(p.svc.undo());
    expect(readFileSync(join(p.root, "src", "a.css"), "utf8")).toBe(css);
  });
  it("builds a palette of html, gable-ui and project components", () => {
    const p = project(TPL(CLEAN));
    mkdirSync(join(p.root, "components", "ui"), { recursive: true });
    writeFileSync(join(p.root, "components", "ui", "button.ts"), `export class UiButton {\n  static meta = { selector: "button[uiButton]", template: "" };\n}\n`);
    const entries = buildPalette(p.root);
    expect(entries.some((e) => e.group === "html" && e.name === "div")).toBe(true);
    expect(entries.find((e) => e.name === "UiButton")).toMatchObject({ group: "gable-ui", snippet: "<button uiButton></button>" });
    expect(entries.find((e) => e.name === "Counter")).toMatchObject({ group: "project", snippet: "<app-counter></app-counter>" });
    expect(snippetFor(".x")).toBeNull();
  });
});
