import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import type { TemplateResult } from "@gable/core";

let n = 0;
/** Mounts a one-off component; each call is a distinct call site via a fresh strings array. */
function mountTemplate(template: TemplateResult, members: object = {}) {
  class T {
    static meta = { selector: `app-t${n++}`, template };
  }
  Object.assign(T.prototype, members);
  return mount(T);
}
const tpl = (source: string): TemplateResult => html(Object.assign([source], { raw: [source] }) as unknown as TemplateStringsArray);

describe("expression language", () => {
  it("supports reads, optional chains, literals, ! and ??", () => {
    const f = mountTemplate(
      tpl(`<p>{{ a.b }}|{{ c?.d }}|{{ c?.d ?? 'dflt' }}|{{ !flag() }}|{{ 'x' }}{{ 42 }}{{ true }}{{ null }}</p>`),
      { a: { b: 1 }, c: undefined, flag: signal(false) },
    );
    expect(f.text()).toBe("1||dflt|true|x42true");
  });

  it.each([
    ["a + b", /operator "\+" is not allowed/],
    ["a ? b : c", /conditional operator is not allowed/],
    ["a === b", /operator "===" is not allowed/],
    ["a && b", /operator "&&" is not allowed/],
    ["items.map(x)", /calls take no arguments/],
    ["fmt(a)", /calls take no arguments/],
    ["a | date", /pipes do not exist/],
    ["x => x", /arrow functions are not allowed/],
    ["a = 1", /assignment is not allowed/],
    ["[1, 2]", /not allowed/],
    ["a[0]", /not allowed/],
    ["Math", /Unknown name "Math".*no globals/],
    ["window.location", /Unknown name "window"/],
  ])("rejects %s with a clear error", (expression, message) => {
    // Syntax errors throw while the template compiles; unknown names are binding errors reported at evaluation.
    let seen: string;
    try {
      const f = mountTemplate(tpl(`<p>{{ ${expression} }}</p>`), { a: 1, b: 2, c: 3, items: [], fmt: () => "" });
      seen = String(f.claimErrors()[0]?.error);
    } catch (error) {
      seen = String(error);
    }
    expect(seen).toMatch(message);
  });

  it("rejects disallowed expressions in bindings and conditions too", () => {
    expect(() => mountTemplate(tpl(`<p [title]="a + 1"></p>`), { a: 1 })).toThrow(/operator "\+"/);
    expect(() => mountTemplate(tpl(`@if (a > 1) {<p></p>}`), { a: 1 })).toThrow(/operator ">"/);
    expect(() => mountTemplate(tpl(`<p (click)="a = 2"></p>`), { a: 1 })).toThrow(/must call a handler|assignment/);
  });

  it("rejects structural-directive syntax and attribute interpolation", () => {
    expect(() => mountTemplate(tpl(`<p *ngIf="a"></p>`), { a: 1 })).toThrow(/@if/);
    expect(() => mountTemplate(tpl(`<p title="{{ a }}"></p>`), { a: 1 })).toThrow(/\[attr\.title\]/);
  });

  it("parses a call site once", () => {
    let parses = 0;
    const strings = Object.assign(["<p>{{ a }}</p>"], { raw: ["<p>{{ a }}</p>"] }) as unknown as TemplateStringsArray;
    const original = Object.getOwnPropertyDescriptor(strings, "0")!;
    Object.defineProperty(strings, "0", { get: () => (parses++, original.value) });
    class P {
      static meta = { selector: "app-p", template: html(strings) };
      a = 1;
    }
    mount(P);
    mount(P);
    expect(parses).toBe(1);
  });
});
