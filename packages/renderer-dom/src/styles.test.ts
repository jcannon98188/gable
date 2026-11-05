// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createDomRenderer } from "./index.js";

const sheet = (id: string) => document.head.querySelector(`style[data-gable="${id}"]`)?.textContent ?? null;

beforeEach(() => {
  document.head.replaceChildren();
});

describe("DOM renderer: scoped styles", () => {
  it("scopes every selector with the returned token attribute", () => {
    const r = createDomRenderer();
    const token = r.registerStyles!("Card", ".a, h2 > .b { color: red } p { margin: 0 }", { scoped: true });
    expect(sheet("Card")).toBe(`.a[${token}], h2 > .b[${token}] { color: red } p[${token}] { margin: 0 }`);
  });

  it("puts the token before pseudo-elements and leaves pseudo-classes alone", () => {
    const r = createDomRenderer();
    const t = r.registerStyles!("P", "a:hover::before { x: y } li:not(.x) span::after { x: y }");
    expect(sheet("P")).toBe(`a:hover[${t}]::before { x: y } li:not(.x) span[${t}]::after { x: y }`);
  });

  it("maps :host to the token and scopes inside @media and @supports, but not @keyframes", () => {
    const r = createDomRenderer();
    const t = r.registerStyles!("H", ":host { display: block } :host(.on) b { x: y } @media (min-width: 1px) { .a { x: y } } @keyframes k { from { x: 1 } to { x: 2 } }");
    expect(sheet("H")).toBe(
      `[${t}] { display: block } [${t}].on b[${t}] { x: y } @media (min-width: 1px) { .a[${t}] { x: y } } @keyframes k { from { x: 1 } to { x: 2 } }`,
    );
  });

  it("leaves CSS untouched when scoping is off", () => {
    const r = createDomRenderer();
    expect(r.registerStyles!("G", ".a { x: y }", { scoped: false })).toBe("");
    expect(sheet("G")).toBe(".a { x: y }");
  });

  it("replaces a re-registered id in place instead of adding another style element", () => {
    const r = createDomRenderer();
    r.registerStyles!("Card", ".a { color: red }", { scoped: false });
    r.registerStyles!("Card", ".a { color: green }", { scoped: false });
    expect(document.head.querySelectorAll("style")).toHaveLength(1);
    expect(sheet("Card")).toBe(".a { color: green }");
  });

  it("gives different ids different tokens", () => {
    const r = createDomRenderer();
    expect(r.registerStyles!("A", ".a {}")).not.toBe(r.registerStyles!("B", ".a {}"));
  });
});
