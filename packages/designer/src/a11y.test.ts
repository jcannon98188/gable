// @vitest-environment jsdom
import { createRequire } from "node:module";
import axeCore from "axe-core";
import { describe, expect, it } from "vitest";
import type { DesignNode } from "@gable/core/designer";
import { PAGE_RULES, RUN_CONTEXT, runOptions, toReport, type AxeLike, type AxeResults } from "./agent/a11y.js";
import { sortChecks } from "../shell/src/app/a11y-state.js";
import { axeModule } from "./server/vite-plugin.js";
import type { A11yCheck } from "./protocol.js";

const axe = axeCore as unknown as AxeLike;

/** A stand-in for the designer hook's nodeOf: elements carrying data-node are "rendered by a template". */
const nodeOf = (el: Element): DesignNode | null => {
  const owner = el.closest("[data-node]");
  if (!owner) return null;
  const id = owner.getAttribute("data-node")!;
  return { id, tag: owner.tagName.toLowerCase(), raw: "", exact: true, start: 0, openEnd: 0, end: 0, component: { id: "c1", name: "TodoItem", source: null }, elements: 1 };
};

async function check(markup: string, mode: "page" | "component" = "component") {
  document.body.innerHTML = markup;
  const { options, skipped } = runOptions(mode);
  const results = await axe.run(RUN_CONTEXT, options);
  return toReport(results, { url: "http://localhost/x", mode, skipped, ms: 12.4, engine: `axe-core ${axe.version}`, nodeOf });
}

describe("accessibility checks (axe-core in the agent)", () => {
  it("reports missing alt text, labels and button names, tied to template nodes", async () => {
    const report = await check(`
      <main>
        <img src="a.png" data-node="n1">
        <input type="text" data-node="n2">
        <button data-node="n3"></button>
        <div role="buttonx">bad role</div>
        <div data-gable-designer><img src="overlay.png"></div>
      </main>`);
    const rules = report.checks.map((c) => c.rule);
    expect(rules).toEqual(expect.arrayContaining(["image-alt", "label", "button-name", "aria-roles"]));
    const img = report.checks.find((c) => c.rule === "image-alt")!;
    expect(img).toMatchObject({ kind: "violation", impact: "critical", node: { id: "n1", tag: "img", component: "TodoItem" } });
    expect(img.html).toContain('src="a.png"');
    expect(img.summary).not.toMatch(/^Fix (any|all)/);
    expect(img.summary.length).toBeGreaterThan(10);
    expect(img.helpUrl).toMatch(/^https:\/\/dequeuniversity\.com\//);
    // An element no template renders is listed, without a link.
    expect(report.checks.find((c) => c.rule === "aria-roles")!.node).toBeNull();
    // The Designer's own overlay is never checked.
    expect(report.checks.filter((c) => c.rule === "image-alt")).toHaveLength(1);
    expect(new Set(report.checks.map((c) => c.id)).size).toBe(report.checks.length);
    expect(report).toMatchObject({ engine: `axe-core ${axe.version}`, mode: "component", ms: 12, skipped: [...PAGE_RULES] });
    expect(report.rules).toBeGreaterThan(20);
    expect(report.passed).toBeGreaterThan(0);
  });

  it("turns page rules off only in component mode", async () => {
    const markup = `<div data-node="a"><p>Hello</p></div>`;
    const component = await check(markup, "component");
    expect(component.checks.some((c) => PAGE_RULES.includes(c.rule))).toBe(false);
    const page = await check(markup, "page");
    expect(page.skipped).toEqual([]);
    // jsdom's document has no lang and no title: a page-level failure, as the real page would get.
    expect(page.checks.map((c) => c.rule)).toEqual(expect.arrayContaining(["html-has-lang"]));
  });

  it("passes clean markup", async () => {
    const report = await check(`<button data-node="n" type="button">Save</button><img src="a.png" alt="Logo"><label>Name <input type="text"></label>`);
    expect(report.checks.filter((c) => c.kind === "violation")).toEqual([]);
  });

  it("keeps undecided checks apart from failures", () => {
    const results: AxeResults = {
      violations: [],
      passes: [{ id: "color-contrast", help: "", helpUrl: "", nodes: [] }],
      inapplicable: [],
      incomplete: [{ id: "color-contrast", impact: "serious", help: "Contrast", helpUrl: "u", nodes: [{ html: "<p>x</p>", target: [["my-el", "p"]], any: [{ message: "Background is an image" }] }] }],
    };
    const r = toReport(results, { url: "u", mode: "page", skipped: [], ms: 1, engine: "axe-core x", nodeOf: () => null });
    expect(r.checks).toEqual([expect.objectContaining({ kind: "review", rule: "color-contrast", summary: "Background is an image", selector: "my-el >>> p", node: null })]);
    expect(r.passed).toBe(0); // a rule with an undecided element did not pass
  });
});

describe("the shell's order", () => {
  const c = (id: string, kind: A11yCheck["kind"], impact: A11yCheck["impact"]): A11yCheck => ({ id, kind, impact, rule: id, help: "", helpUrl: "", summary: "", html: "", selector: "", node: null });
  it("lists violations first, then by impact", () => {
    const sorted = sortChecks([c("a", "review", "critical"), c("b", "violation", "minor"), c("c", "violation", "critical"), c("d", "violation", null), c("e", "violation", "serious")]);
    expect(sorted.map((x) => x.id)).toEqual(["c", "e", "b", "d", "a"]);
  });
});

describe("the plugin's axe module", () => {
  it("wraps the Designer's axe-core as an ES module", async () => {
    const file = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
    const code = await axeModule(file);
    expect(code.startsWith("/*! axe v")).toBe(true);
    expect(code.trimEnd().endsWith("export default globalThis.axe;")).toBe(true);
  });

  it("says why when axe-core is missing", async () => {
    expect(await axeModule(null)).toMatch(/^throw new Error\("axe-core is not installed/);
  });
});
