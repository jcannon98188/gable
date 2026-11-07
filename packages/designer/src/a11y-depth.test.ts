// @vitest-environment jsdom
// Accessibility depth (TASK-56.26): the focus order, the accessibility tree and stepping focus (agent/a11y-depth.ts, run on a
// real DOM), the Focus & tree panel's rows, and what the MCP tools make of the reports.
import { afterEach, describe, expect, it, vi } from "vitest";
import { a11yTree, focusOrder, hasFocusIndicator, nameOf, roleOf, stepFocus, tabOrder, type NodeRef } from "./agent/a11y-depth.js";
import { treeRows } from "../shell/src/app/focus-state.js";
import { checksView, focusView, outline, stepView, treeView } from "./server/mcp/a11y-tools.js";

/** Elements carrying data-node are "rendered by a template" (the nearest such ancestor, as the agent's lookup does). */
const nodeOf = (el: Element): NodeRef | null => {
  const owner = el.closest("[data-node]");
  return owner ? { id: owner.getAttribute("data-node")!, tag: owner.tagName.toLowerCase(), component: "Demo" } : null;
};
const opts = { nodeOf, mode: "component" as const, url: "http://localhost/x" };
const page = (markup: string) => {
  document.body.innerHTML = markup;
  return document;
};
const names = (els: Element[]) => els.map((e) => e.getAttribute("id") ?? e.tagName.toLowerCase());

afterEach(() => (document.body.innerHTML = ""));

// jsdom caches computed style until the DOM changes (not when focus moves), so the focus styles are stubbed here; a real
// browser's are checked by e2e/a11y-depth-check.mjs.
const stubFocusStyles = (rules: Record<string, { outline?: string; boxShadow?: string }>) => {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
    const base = real(el, pseudo);
    const focused = document.activeElement === el;
    const r = rules[el.id] ?? {};
    return new Proxy(base, { get: (t, k) => (k === "outline" ? (focused ? (r.outline ?? "none") : "none") : k === "outlineStyle" ? (focused && r.outline ? "solid" : "none") : k === "outlineWidth" ? (focused && r.outline ? "2px" : "0px") : k === "boxShadow" ? (focused ? (r.boxShadow ?? "none") : "none") : Reflect.get(t, k)) });
  });
};

describe("tab order", () => {
  it("follows document order for natively focusable elements and tabindex 0", () => {
    page(`<a id="a" href="/x">A</a><button id="b">B</button><div id="d" tabindex="0">D</div><input id="i"><span id="s">no</span><a id="n">no href</a>`);
    expect(names(tabOrder(document))).toEqual(["a", "b", "d", "i"]);
  });

  it("puts positive tabindex first, ascending, then the rest", () => {
    page(`<button id="a">A</button><button id="b" tabindex="2">B</button><button id="c" tabindex="1">C</button><button id="d" tabindex="1">D</button>`);
    expect(names(tabOrder(document))).toEqual(["c", "d", "b", "a"]);
  });

  it("leaves out disabled, hidden, inert, display:none and negative tabindex", () => {
    page(`
      <button id="ok">ok</button>
      <button id="dis" disabled>x</button>
      <fieldset disabled><legend><input id="inlegend"></legend><input id="infs"></fieldset>
      <button id="hid" hidden>x</button>
      <div style="display:none"><button id="none">x</button></div>
      <button id="vis" style="visibility:hidden">x</button>
      <div inert><button id="inert">x</button></div>
      <button id="neg" tabindex="-1">x</button>
      <input id="hidden" type="hidden">
      <div data-gable-designer><button id="overlay">x</button></div>`);
    expect(names(tabOrder(document))).toEqual(["ok", "inlegend"]);
  });

  it("makes a radio group one stop: the checked radio, else the first", () => {
    page(`<input type="radio" name="g" id="r1"><input type="radio" name="g" id="r2" checked><input type="radio" name="g" id="r3"><input type="radio" name="h" id="h1"><input type="radio" name="h" id="h2">`);
    expect(names(tabOrder(document))).toEqual(["r2", "h1"]);
  });

  it("includes summary of details, contenteditable, and media with controls", () => {
    page(`<details><summary id="sum">More</summary><p>x</p></details><div id="ce" contenteditable="true"></div><video id="v" controls></video><video id="nv"></video>`);
    expect(names(tabOrder(document))).toEqual(["sum", "ce", "v"]);
  });
});

describe("roles and names", () => {
  it("gives implicit roles", () => {
    page(`<nav id="n"></nav><main id="m"></main><h2 id="h">T</h2><img id="i" alt="x"><img id="p" alt=""><input id="c" type="checkbox"><input id="r" type="range"><select id="s"></select><ul id="u"></ul><a id="l" href="/">l</a><a id="nl">l</a><section id="sec"></section><section id="lab" aria-label="Orders"></section><header id="hd"></header><article><header id="ah"></header></article>`);
    const role = (id: string) => roleOf(document.getElementById(id)!);
    expect(["n", "m", "h", "i", "p", "c", "r", "s", "u", "l", "nl", "sec", "lab", "hd", "ah"].map(role)).toEqual(["navigation", "main", "heading", "img", "presentation", "checkbox", "slider", "combobox", "list", "link", "generic", "generic", "region", "banner", "generic"]);
  });

  it("lets an explicit role win", () => {
    page(`<div id="d" role="button">x</div><a id="a" href="/" role="tab menuitem">x</a>`);
    expect(roleOf(document.getElementById("d")!)).toBe("button");
    expect(roleOf(document.getElementById("a")!)).toBe("tab");
  });

  it("computes names: aria-labelledby, aria-label, label, alt, content, title, placeholder", () => {
    page(`
      <span id="lbl">Ship to</span>
      <input id="a" aria-labelledby="lbl">
      <input id="b" aria-label="Quantity" placeholder="ignored">
      <label for="c">Email <b>address</b></label><input id="c">
      <label>Wrapped <input id="w"></label>
      <img id="d" alt="Logo">
      <button id="e">Save <span aria-hidden="true">★</span> now</button>
      <button id="f" title="Close"></button>
      <input id="g" placeholder="Search">
      <button id="h"></button>
      <input id="sub" type="submit">
      <input id="val" type="button" value="Go">
      <a id="lk" href="/"><img alt="Home"></a>
      <fieldset id="fs"><legend>Billing</legend></fieldset>`);
    const n = (id: string) => nameOf(document.getElementById(id)!);
    expect(["a", "b", "c", "w", "d", "e", "f", "g", "h", "sub", "val", "lk", "fs"].map(n)).toEqual(["Ship to", "Quantity", "Email address", "Wrapped", "Logo", "Save now", "Close", "Search", "", "Submit", "Go", "Home", "Billing"]);
  });

  it("does not follow its own aria-labelledby in a loop", () => {
    page(`<button id="a" aria-labelledby="a">Own text</button>`);
    expect(() => nameOf(document.getElementById("a")!)).not.toThrow();
  });
});

describe("focus order report", () => {
  it("lists stops with names, roles and the template node, and flags what is wrong", () => {
    page(`
      <div data-node="n1"><a href="/x" id="a">Home</a></div>
      <button id="b" tabindex="3">Buy</button>
      <input id="c">
      <div aria-hidden="true"><button id="d">Hidden</button></div>
      <button id="e" tabindex="-1">script</button>
      <div id="f" role="button">fake</div>
      <div id="g" onclick="x()">clicky</div>
      <button id="h" aria-label="ok"></button>`);
    const r = focusOrder(document, opts);
    expect(r.stops.map((s) => `${s.index}:${s.name || "-"}`)).toEqual(["1:Buy", "2:Home", "3:-", "4:Hidden", "5:ok"]);
    expect(r.stops[0]).toMatchObject({ role: "button", tabindex: 3, warnings: ["positive-tabindex"], node: null });
    expect(r.stops[1]).toMatchObject({ role: "link", warnings: [], node: { id: "n1", tag: "div", component: "Demo" } });
    expect(r.stops[2]).toMatchObject({ role: "textbox", warnings: ["no-name"] });
    expect(r.stops[3]!.warnings).toEqual(["aria-hidden"]);
    expect(r.scripted).toEqual([expect.objectContaining({ name: "script", tabindex: -1 })]);
    expect(r.unreachable.map((u) => u.name)).toEqual(["fake", "clicky"]);
    expect(r.unreachable[0]!.reason).toMatch(/tabindex="0"/);
    expect(r.focused).toBeNull();
    expect(r.mode).toBe("component");
  });

  it("reports the focused stop", () => {
    page(`<button id="a">A</button><button id="b">B</button>`);
    document.getElementById("b")!.focus();
    const r = focusOrder(document, opts);
    expect(r.focused).toBe(2);
    expect(r.activeElement).toMatchObject({ tag: "button", name: "B" });
    expect(r.stops[1]!.focused).toBe(true);
  });

  it("flags a stop that is entirely above the previous one (visual order differs from tab order)", () => {
    page(`<button id="a">A</button><button id="b">B</button><button id="c">C</button>`);
    const rects: Record<string, [number, number]> = { a: [200, 20], b: [20, 20], c: [300, 20] };
    for (const [id, [top, height]] of Object.entries(rects)) document.getElementById(id)!.getBoundingClientRect = () => ({ left: 0, top, width: 50, height, right: 50, bottom: top + height, x: 0, y: top, toJSON: () => ({}) });
    const r = focusOrder(document, opts);
    expect(r.stops.map((s) => s.warnings)).toEqual([[], ["jumps-back"], []]);
  });
});

describe("accessibility tree", () => {
  it("builds roles, names and states, and leaves generic wrappers out", () => {
    page(`
      <div><div><main data-node="m">
        <h1>Shop</h1>
        <nav aria-label="Primary"><ul><li><a href="/a">Home</a></li><li><a href="/b" aria-current="page">Cart</a></li></ul></nav>
        <label>Agree <input type="checkbox" checked></label>
        <button disabled>Pay</button>
        <details open><summary>More</summary>Body</details>
        <p>Some text</p>
      </main></div></div>`);
    const r = a11yTree(document, opts);
    const flat = outline(r.tree).lines.join("\n");
    expect(flat).toBe(
      [
        'main',
        '  heading "Shop" [level=1]',
        '  navigation "Primary"',
        '    list',
        '      listitem "Home"',
        '        link "Home" (tab)',
        '      listitem "Cart"',
        '        link "Cart" [current=page] (tab)',
        '  checkbox "Agree" [checked] (tab)',
        '  button "Pay" [disabled]',
        '  group "More" [expanded]',
        '    button "More" (tab)',
        '    text "Body"',
        '  text "Some text"',
      ].join("\n"),
    );
    expect(r.tree[0]!.node).toEqual({ id: "m", tag: "main", component: "Demo" });
    expect(r).toMatchObject({ unnamed: 0, headingSkips: 0, truncated: false, root: null });
  });

  it("leaves out hidden content and the Designer's overlay, and flags missing names and heading skips", () => {
    page(`
      <h1>One</h1><h3>Three</h3><h2></h2>
      <img src="x.png">
      <button></button>
      <div aria-hidden="true"><button>Hidden</button></div>
      <div hidden><button>Gone</button></div>
      <div style="display:none"><button>None</button></div>
      <div data-gable-designer><button>overlay</button></div>
      <div role="presentation"><span>kept text</span></div>`);
    const r = a11yTree(document, opts);
    const lines = outline(r.tree).lines;
    expect(lines).toEqual(['heading "One" [level=1]', 'heading "Three" [level=3] !heading-skip: h1 to h3', "heading [level=2] !empty-heading", "img !no-name", "button (tab) !no-name", 'text "kept text"']);
    expect(r).toMatchObject({ unnamed: 2, headingSkips: 1 });
  });

  it("starts from an element and does not expose children of a button", () => {
    page(`<div id="x"><button id="b">Go <img alt="arrow"></button></div><p>Other</p>`);
    const r = a11yTree(document, { ...opts, root: document.getElementById("x"), rootNode: { id: "t9", tag: "div" } });
    expect(outline(r.tree).lines).toEqual(['button "Go arrow" (tab)']);
    expect(r.root).toEqual({ id: "t9", tag: "div" });
  });

  it("states checked, expanded and pressed from ARIA too", () => {
    page(`<div role="switch" aria-checked="true" aria-label="Dark" tabindex="0"></div><button aria-expanded="false" aria-haspopup="menu" aria-pressed="mixed">Menu</button>`);
    expect(outline(a11yTree(document, opts).tree).lines).toEqual(['switch "Dark" [checked] (tab)', 'button "Menu" [not expanded, pressed=mixed, haspopup=menu] (tab)']);
  });
});

describe("stepping focus", () => {
  it("moves through the stops, wraps, and goes back", () => {
    page(`<button id="a">A</button><button id="b">B</button><button id="c">C</button>`);
    const step = (to: "next" | "prev" | "first" | "last", steps = 1) => stepFocus(document, { to, steps, nodeOf });
    expect(step("next").visited.map((v) => v.name)).toEqual(["A"]);
    expect(step("next", 2).visited.map((v) => v.name)).toEqual(["B", "C"]);
    const wrapped = step("next");
    expect(wrapped.visited.map((v) => v.name)).toEqual(["A"]);
    expect(wrapped.wrapped).toBe(true);
    expect(step("prev").visited.map((v) => v.name)).toEqual(["C"]);
    expect(step("first").visited[0]).toMatchObject({ index: 1, name: "A" });
    expect(step("last").visited[0]).toMatchObject({ index: 3, name: "C" });
    expect(step("next", 3).trapped).toBeNull();
  });

  it("walks to a given element", () => {
    page(`<button id="a">A</button><button id="b" data-node="t2">B</button>`);
    const r = stepFocus(document, { to: { element: document.getElementById("b")! }, steps: 1, nodeOf });
    expect(r.visited[0]).toMatchObject({ index: 2, name: "B", node: { id: "t2" } });
    expect(document.activeElement?.id).toBe("b");
  });

  it("reports a page with nothing to tab to", () => {
    page(`<p>text</p>`);
    expect(stepFocus(document, { to: "next", steps: 3, nodeOf })).toMatchObject({ visited: [], stops: 0 });
  });

  it("reports a focus trap: focus handed back by script", () => {
    page(`<button id="a">A</button><button id="b">B</button>`);
    const a = document.getElementById("a")!;
    // After b takes focus the page's own handler moves it back to a.
    document.getElementById("b")!.addEventListener("focus", () => a.focus());
    const r = stepFocus(document, { to: "first", steps: 4, nodeOf });
    expect(r.visited.map((v) => v.name)).toEqual(["A"]);
    expect(r.trapped).toMatch(/did not move to button "B"/);
  });

  it("reports whether focusing an element changes how it looks", () => {
    page(`<button id="a">A</button><button id="b">B</button><button id="c">C</button>`);
    stubFocusStyles({ a: { outline: "2px solid blue" }, c: { boxShadow: "0 0 0 2px red" } });
    const ind = (id: string) => hasFocusIndicator(document.getElementById(id)!);
    expect([ind("a"), ind("b"), ind("c")]).toEqual([true, false, true]);
    const r = stepFocus(document, { to: "first", steps: 3, nodeOf });
    expect(r.visited.map((v) => v.indicator)).toEqual([true, false, true]);
    expect(document.activeElement?.id).toBe("c");
    vi.restoreAllMocks();
  });
});

describe("the Focus & tree panel", () => {
  it("flattens the tree with depth and honours collapsed rows", () => {
    page(`<nav aria-label="Menu"><ul><li><a href="/">Home</a></li></ul></nav>`);
    const tree = a11yTree(document, opts).tree;
    const all = treeRows(tree);
    expect(all.map((r) => `${r.depth}:${r.role}`)).toEqual(["0:navigation", "1:list", "2:listitem", "3:link"]);
    expect(all[0]).toMatchObject({ nameText: '"Menu"', twisty: "▾", expanded: "true", hasChildren: true });
    expect(all[3]).toMatchObject({ focusable: true, hasChildren: false });
    const collapsed = treeRows(tree, new Set([all[1]!.key]));
    expect(collapsed.map((r) => r.role)).toEqual(["navigation", "list"]);
    expect(collapsed[1]).toMatchObject({ twisty: "▸", expanded: "false" });
  });
});

describe("what the MCP tools make of the reports", () => {
  it("lists the focus order as lines with the problems called out", () => {
    page(`<button id="a" tabindex="2">Buy</button><input id="b"><div role="button">fake</div>`);
    document.getElementById("b")!.focus();
    const v = focusView(focusOrder(document, opts));
    expect(v.order).toEqual(['1. button "Buy" tabindex=2 not rendered by a template !positive-tabindex', "2. textbox (no name) not rendered by a template !no-name <- focus"]);
    expect(v.problems.map((p) => p.stop)).toEqual([1, 2]);
    expect(v.unreachable).toEqual([expect.objectContaining({ role: "button", name: "fake" })]);
    expect(v.focus).toMatchObject({ tag: "input", stop: 2 });
  });

  it("outlines the tree, cutting long ones", () => {
    page(Array.from({ length: 30 }, (_, i) => `<button>B${i}</button>`).join(""));
    const r = a11yTree(document, opts);
    const v = treeView(r, 10);
    expect(v.tree).toHaveLength(10);
    expect(v).toMatchObject({ nodes: 30, linesCut: 20, unnamedControls: 0 });
    expect(treeView(r, 100)).not.toHaveProperty("linesCut");
  });

  it("summarises a step run and the checker's report", () => {
    page(`<button id="a">A</button><button id="b">B</button>`);
    stubFocusStyles({ a: { outline: "2px solid blue" } });
    const v = stepView(stepFocus(document, { to: "first", steps: 2, nodeOf }));
    expect(v).toMatchObject({ stopsOnPage: 2, withoutFocusIndicator: 1, trapped: null });
    expect(v.visited[1]).toContain("no visible focus indicator");
    vi.restoreAllMocks();
    const c = checksView(
      {
        engine: "axe-core 4",
        url: "u",
        mode: "page",
        rules: 80,
        skipped: [],
        passed: 70,
        ms: 1,
        checks: [
          { id: "1", rule: "image-alt", kind: "violation", impact: "critical", help: "h", helpUrl: "u", summary: "s", html: "<img>", selector: "img", node: { id: "n", tag: "img", component: "Hero" } },
          { id: "2", rule: "color-contrast", kind: "review", impact: null, help: "h", helpUrl: "u", summary: "s", html: "<p>", selector: "p", node: null },
        ],
      },
      1,
    );
    expect(c).toMatchObject({ violations: 1, toReview: 1, cut: 1, checks: [{ rule: "image-alt", at: "<img> in Hero" }] });
  });
});
