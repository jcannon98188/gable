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
    ["a - b", /operator "-" is not allowed/],
    ["a * b", /operator "\*" is not allowed/],
    ["a == b", /loose equality "==" is not allowed. Use "==="/],
    ["a != b", /loose inequality "!=" is not allowed. Use "!=="/],
    ["a & b", /operator "&" is not allowed/],
    ["a || b ?? c", /cannot be mixed/],
    ["a ?? b && c", /cannot be mixed/],
    ["a ?? b || c", /cannot be mixed/],
    ["a && b ?? c", /cannot be mixed/],
    ["a === ", /unexpected end/],
    ["a < < b", /unexpected "<"/],
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
    expect(() => mountTemplate(tpl(`@if (a + 1) {<p></p>}`), { a: 1 })).toThrow(/operator "\+"/);
    expect(() => mountTemplate(tpl(`<p [title]="a == 1"></p>`), { a: 1 })).toThrow(/Use "==="/);
    expect(() => mountTemplate(tpl(`<p (click)="a = 2"></p>`), { a: 1 })).toThrow(/must call a handler|assignment/);
  });

  it("evaluates comparisons and logical operators with JavaScript precedence", () => {
    const f = mountTemplate(
      tpl(
        `<p>{{ a === 1 }}|{{ a !== 1 }}|{{ a < b }}|{{ a > b }}|{{ a <= 1 }}|{{ b >= 3 }}|{{ 'x' === 'x' }}|` +
          `{{ a < b && b < 3 }}|{{ a > b || b === 2 }}|{{ a > b || b > a && !flag }}|{{ (a > b || b > a) && flag }}|` +
          `{{ a === 1 === true }}|{{ 1 < 2 === true }}|{{ c?.d ?? 5 }}|{{ (c?.d ?? 0) < 1 }}|{{ (a && b) ?? 9 }}|{{ 0 || 'z' }}|{{ 1 && 'y' }}</p>`,
      ),
      { a: 1, b: 2, c: undefined, flag: false },
    );
    expect(f.text()).toBe("true|false|true|false|true|false|true|true|true|true|false|true|true|5|true|2|z|y");
  });

  it("allows comparisons in bindings, conditions and attribute values containing < or >", async () => {
    const count = signal(2);
    const f = mountTemplate(
      tpl(`<button [disabled]="count() <= 0" title="a > b < c" [class.big]="count() > 1">{{ count() >= 2 }}</button>@if (count() < 3 && count() > 0) {<i>in</i>} @else {<b>out</b>}`),
      { count },
    );
    expect(f.html()).toContain("a &gt; b &lt; c");
    expect(f.html()).toContain(">true</button>");
    expect(f.html()).toContain("big");
    expect(f.text()).toContain("in");
    count.set(0);
    await f.flush();
    expect(f.html()).toContain(">false</button>");
    expect(f.html()).not.toContain("big");
    expect(f.text()).toContain("out");
  });

  it("tracks signals read only in the right operand once the left lets them through", async () => {
    const gate = signal(false);
    const value = signal(1);
    let reads = 0;
    const probe = () => (reads++, value());
    const f = mountTemplate(tpl(`<p>{{ gate() && probe() > 0 }}</p>`), { gate, probe });
    expect(f.text()).toBe("false");
    expect(reads).toBe(0);
    value.set(2); // not a dependency while gate is false
    await f.flush();
    expect(reads).toBe(0);
    gate.set(true);
    await f.flush();
    expect(f.text()).toBe("true");
    expect(reads).toBe(1);
    value.set(-1); // now a dependency
    await f.flush();
    expect(f.text()).toBe("false");
    expect(reads).toBe(2);
    gate.set(false); // and not again once the left short-circuits
    await f.flush();
    value.set(5);
    await f.flush();
    expect(reads).toBe(2);
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
