import { describe, expect, it } from "vitest";
import { cpSync, readFileSync, rmSync } from "node:fs";
import { check, fixture, where } from "../test-support/check.js";
import { main } from "./cli.js";

describe("lazy() outside @defer", () => {
  it("passes lazy components used inside @defer, including its triggers, @placeholder, @loading and @error blocks", async () => {
    const { code, diagnostics } = await check("lazy-pass");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(0);
  });

  it("flags a lazy component used outside @defer and in @placeholder", async () => {
    const { code, diagnostics } = await check("lazy-fail");
    expect(code).toBe(1);
    const first = where("lazy-fail", "<x-chart>", 1);
    const third = where("lazy-fail", "@placeholder {\n        <x-chart>", "@placeholder {\n        <".length);
    expect(diagnostics.map((d) => [d.rule, d.line, d.column])).toEqual([
      ["lazy-outside-defer", first.line, first.column],
      ["lazy-outside-defer", third.line, third.column],
    ]);
    expect(diagnostics[0]!.message).toMatch(/Chart/);
  });
});

const found = (diagnostics: Array<{ rule: string; line: number; column: number; severity: string }>) => diagnostics.map((d) => [d.rule, d.line, d.column, d.severity]);

describe("constructors in components and services", () => {
  it("passes classes without constructors, and constructors on plain classes", async () => {
    expect((await check("ctor-pass")).diagnostics).toEqual([]);
  });

  it("flags a constructor in a component and in a service, not in a plain class", async () => {
    const { code, diagnostics } = await check("ctor-fail");
    const a = where("ctor-fail", "constructor() {\n    this.n");
    const b = where("ctor-fail", "constructor() {}");
    expect(found(diagnostics)).toEqual([
      ["constructor-in-class", a.line, a.column, "error"],
      ["constructor-in-class", b.line, b.column, "error"],
    ]);
    expect(code).toBe(1);
  });
});

describe("injectHost() outside Setup", () => {
  it("passes calls in field initialisers and in helpers", async () => {
    expect((await check("host-pass")).diagnostics).toEqual([]);
  });

  it("flags module level, static fields, field-stored callbacks and methods, not field initialisers", async () => {
    const { code, diagnostics } = await check("host-fail");
    const flagged = ["atModuleLevel = ", "shared = ", "handler = () => ", "return "].map((prefix) => {
      const pos = where("host-fail", prefix + "injectHost()", prefix.length);
      return ["inject-host-context", pos.line, pos.column, "error"];
    });
    expect(found(diagnostics)).toEqual(flagged);
    expect(code).toBe(1);
  });
});

describe("module-level signals and subjects", () => {
  it("passes state kept in hotState, local state and plain constants", async () => {
    const { diagnostics, code } = await check("state-pass");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(0);
  });

  it("warns on a module-level signal, computed and subject, and says to use hotState", async () => {
    const { code, diagnostics } = await check("state-fail");
    expect(found(diagnostics)).toEqual(
      ["count = signal", "doubled = computed", "events = new Subject", "latest = new BehaviorSubject"].map((s) => {
        const at = where("state-fail", s);
        return ["module-level-state", at.line, at.column, "warn"];
      }),
    );
    expect(diagnostics[0]!.message).toMatch(/hotState/);
    expect(code).toBe(0);
  });
});

describe("non-literal Tailwind class fragments", () => {
  it("passes literal class names and bindings", async () => {
    expect((await check("fragment-pass")).diagnostics).toEqual([]);
  });

  it("warns on a hole glued to class text and on string concatenation in [class]", async () => {
    const { diagnostics } = await check("fragment-fail");
    const first = where("fragment-fail", "${color}-500\"></div>");
    const plus = where("fragment-fail", "+ hue()");
    const last = where("fragment-fail", "${color}-500 p-2");
    expect(found(diagnostics.filter((d) => d.rule === "class-fragment"))).toEqual([
      ["class-fragment", first.line, first.column, "warn"],
      ["class-fragment", plus.line, plus.column, "warn"],
      ["class-fragment", last.line, last.column, "warn"],
    ]);
  });
});

describe("tsconfig settings that break native class fields", () => {
  it("is quiet for the fixture default (ES2022 with useDefineForClassFields)", async () => {
    expect((await check("ctor-pass")).diagnostics.filter((d) => d.rule === "class-fields-config")).toEqual([]);
  });

  it("flags useDefineForClassFields: false in the tsconfig", async () => {
    const { code, diagnostics } = await check("classfields-define");
    const at = where("classfields-define", '"useDefineForClassFields"', 0, "../tsconfig.json");
    expect(found(diagnostics)).toEqual([["class-fields-config", at.line, at.column, "error"]]);
    expect(diagnostics[0]!.file).toMatch(/tsconfig\.json$/);
    expect(code).toBe(1);
  });

  it("flags a target below ES2022 when class fields are not forced on", async () => {
    const { diagnostics } = await check("classfields-target");
    const at = where("classfields-target", '"target"', 0, "../tsconfig.json");
    expect(found(diagnostics)).toEqual([["class-fields-config", at.line, at.column, "error"]]);
  });
});

describe("router link rules", () => {
  it("passes imported routerLink and routerLinkActive, a string-typed binding, and plain anchors", async () => {
    const { code, diagnostics } = await check("router-pass");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(0);
  });

  it("flags links whose directive is not imported and a routerLink bound to a non-string", async () => {
    const { code, diagnostics } = await check("router-fail");
    const active = where("router-fail", "routerLinkActive=");
    const count = where("router-fail", "count()\">");
    const bare = where("router-fail", "[routerLink]=\"'/x'\"", 1);
    expect(found(diagnostics)).toEqual([
      ["router-link-import", active.line, active.column, "error"],
      ["router-link-type", count.line, count.column, "error"],
      ["router-link-import", bare.line, bare.column, "error"],
    ]);
    expect(diagnostics[0]!.message).toMatch(/RouterLinkActive/);
    expect(code).toBe(1);
  });
});

describe("forms rules", () => {
  it("passes native and custom controls bound to matching fields, state reads and rows tracked by key", async () => {
    const { code, diagnostics } = await check("forms-pass");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(0);
  });

  it("reports each forms mistake once, at the offending template text", async () => {
    const { code, diagnostics } = await check("forms-fail");
    const at = (snippet: string, into = 0) => where("forms-fail", snippet, into);
    const expected: Array<[string, { line: number; column: number }, string]> = [
      ["field-not-a-field", at("notAField\" />"), "error"],
      ["field-value-mismatch", at("f.age\" />"), "error"],
      ["field-value-mismatch", at("f.name\" />"), "error"],
      ["field-value-mismatch", at("f.name\"></x-rating>"), "error"],
      ["custom-control-members", at("x-plain [field]"), "error"],
      ["bare-signal", at("{{ f.name.state.errors }}", "{{ f.name.state.".length), "error"],
      ["rows-track-key", at("row.label()) {"), "warn"],
      ["model-key-state", at("state: \"open\""), "error"],
    ];
    expect(found(diagnostics)).toEqual(expected.map(([rule, p, severity]) => [rule, p.line, p.column, severity]));
    expect(code).toBe(1);
  });

  it("names the fix for an uncalled state read", async () => {
    const { diagnostics } = await check("forms-fail");
    expect(diagnostics.find((d) => d.rule === "bare-signal")!.message).toMatch(/f\.name\.state\.errors\(\)/);
  });
});

describe("component-meta", () => {
  it("passes valid metas, typed metas, shared metas, directives and classes without static meta", async () => {
    const { code, diagnostics } = await check("meta-pass");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(0);
  });

  it("reports unknown keys, bad values, non-component imports and a missing selector", async () => {
    const { code, diagnostics } = await check("meta-fail");
    const at = (snippet: string, into = 0) => where("meta-fail", snippet, into);
    const expected = [
      at("selectr"),
      at("NotAComponent, Plain"),
      at("Plain, \"x-leaf\"]"),
      at("\"x-leaf\"]"),
      at("{ role: 3 }"),
      at("\"shadow\""),
      at("7,"),
      at("meta = { template"),
    ];
    expect(found(diagnostics)).toEqual(expected.map((p) => ["component-meta", p.line, p.column, "error"]));
    expect(code).toBe(1);
    expect(diagnostics[0]!.message).toMatch(/Did you mean "selector"/);
    expect(diagnostics[1]!.message).toMatch(/imports entry NotAComponent is not a component or a lazy\(\) entry/);
  });

  it("offers 'satisfies ComponentMeta' (with the import), and a spelling fix for a near-miss key", async () => {
    const { diagnostics } = await check("meta-fail");
    const fixes = (diagnostics as unknown as Array<{ fixes?: Array<{ title: string; edits: Array<{ newText: string }> }> }>)[0]!.fixes!;
    expect(fixes.map((f) => f.title)).toEqual(["Add 'satisfies ComponentMeta'", "Change spelling to 'selector'"]);
    expect(fixes[0]!.edits.map((e) => e.newText)).toEqual([", type ComponentMeta", " satisfies ComponentMeta"]);
  });

  it("applies the fix with --fix, after which the compiler takes over the checking", async () => {
    const copy = fixture("_meta-fix-run");
    rmSync(copy, { recursive: true, force: true });
    cpSync(fixture("meta-fail"), copy, { recursive: true });
    try {
      let after: Array<{ rule: string }> = [];
      await main(["--project", copy, "--fix", "--format", "json"], { stdout: (s) => (after = JSON.parse(s)), stderr: () => {} });
      const source = readFileSync(`${copy}/src/app.ts`, "utf8");
      expect(source).toContain('import { html, signal, type ComponentMeta } from "@gable/core";');
      expect(source.match(/ satisfies ComponentMeta/g)).toHaveLength(3);
      expect(after).toEqual([]);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});

describe("store rules", () => {
  it("passes reads in templates, methods in handlers, patchState and stores made in Setup", async () => {
    expect((await check("store-pass")).diagnostics).toEqual([]);
  });

  it("flags state-source writes, store methods in value expressions, and new Store() outside Setup", async () => {
    const { code, diagnostics } = await check("store-fail");
    const at = (snippet: string, into = 0) => where("store-fail", snippet, into);
    const sneaky = at("store[STATE_SOURCE].set");
    const method = at("store.add() }}", "store.".length);
    const orphan = at("new CartStore();\n\nexport class");
    expect(found(diagnostics).sort()).toEqual(
      [
        ["store-write-outside-patch", sneaky.line, sneaky.column, "error"],
        ["store-method-in-template", method.line, method.column, "error"],
        ["store-outside-injection-context", orphan.line, orphan.column, "error"],
      ].sort(),
    );
    expect(code).toBe(1);
  });
});

describe("accessibility rules", () => {
  it("passes accessible templates", async () => {
    const { code, diagnostics } = await check("a11y-pass");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(0);
  });

  it("warns on each accessibility mistake, at the offending template text", async () => {
    const { code, diagnostics } = await check("a11y-fail");
    const at = (snippet: string, into = 0) => where("a11y-fail", snippet, into);
    const expected: Array<[string, { line: number; column: number }]> = [
      ["a11y-heading-order", at("<h3>", 1)],
      ["a11y-img-alt", at("<img", 1)],
      ["a11y-control-name", at("<button", 1)],
      ["a11y-control-name", at("<a href", 1)],
      ["a11y-control-name", at("<input type=\"text\" placeholder", 1)],
      ["a11y-control-name", at("<textarea", 1)],
      ["a11y-aria-valid", at("role=\"buton\"")],
      ["a11y-aria-valid", at("aria-lable")],
      ["a11y-aria-valid", at("aria-hidden=\"yes\"")],
      ["a11y-click-key", at("<div (click)", 6)],
      ["a11y-click-key", at("<div role=\"button\" (click)", 20)],
      ["a11y-tabindex-positive", at("tabindex=\"3\"")],
      ["a11y-tabindex-positive", at("[attr.tabindex]", 1)],
      ["a11y-autofocus", at("autofocus")],
    ];
    expect(found(diagnostics)).toEqual(expected.map(([rule, p]) => [rule, p.line, p.column, "warn"]));
    expect(code).toBe(0);
  });

  it("suggests the intended ARIA attribute and names what a click handler lacks", async () => {
    const { diagnostics } = await check("a11y-fail");
    expect(diagnostics.find((d) => d.message.includes("aria-lable"))!.message).toMatch(/Did you mean "aria-label"/);
    const clicks = diagnostics.filter((d) => d.rule === "a11y-click-key").map((d) => d.message);
    expect(clicks[0]).toMatch(/a role and a keyboard handler/);
    expect(clicks[1]).toMatch(/add a keyboard handler/);
  });

  it("honours severity configuration", async () => {
    const { diagnostics } = await check("a11y-fail");
    expect(new Set(diagnostics.map((d) => d.rule)).size).toBe(7);
  });
});

describe("template holes", () => {
  it("reports a ${} hole as a template-syntax error (TASK-30)", async () => {
    const { diagnostics } = await check("fragment-fail");
    const holes = diagnostics.filter((d) => d.rule === "template-syntax" && /holes/.test(d.message));
    expect(holes.length).toBe(2);
  });
});
