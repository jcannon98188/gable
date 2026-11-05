import { describe, expect, it } from "vitest";
import { computed, effect, html, inject, signal } from "@gable/core";
import { mount } from "@gable/testing";

// Each "version" of a class is a fresh class with the same name, as a re-evaluated module would produce.

const counter = (v: { template?: string; step?: number; triple?: boolean; hmr?: "reset" | "reload" | "ignore"; field?: string; styles?: string } = {}) => {
  const field = v.field ?? "count";
  const factor = v.triple ? 3 : 2;
  const template = v.template ?? "Count: {{ " + field + "() }} double: {{ scaled() }}";
  // Built by hand so each version has its own source text and template call site.
  const source = `
    return class Counter {
      static meta = { selector: "app-counter", template: html([${JSON.stringify(template)}]), styles: ${JSON.stringify(v.styles ?? "")} };
      ${v.hmr ? `static hmr = ${JSON.stringify(v.hmr)};` : ""}
      ${field} = signal(0);
      scaled = computed(() => this.${field}() * ${factor});
      setups = (log.push("setup"), 0);
      increment() { this.${field}.update((n) => n + ${v.step ?? 1}); }
    };`;
  return new Function("html", "signal", "computed", "log", source)(
    (s: string[]) => ({ strings: Object.assign([...s], { raw: [...s] }), values: [] }),
    signal,
    computed,
    setupLog,
  ) as new () => any;
};
let setupLog: string[] = [];

describe("hotReplace: patch and view rebuild", () => {
  it("a template edit rebuilds the view on the same instance and keeps state", async () => {
    setupLog = [];
    const fixture = mount(counter());
    fixture.instance.increment();
    fixture.instance.increment();
    await fixture.flush();
    const before = fixture.instance;
    expect(fixture.text()).toBe("Count: 2 double: 4");

    const result = fixture.hotReplace(counter({ template: "The count is {{ count() }}" }));
    await fixture.flush();

    expect(result.status).toBe("applied");
    expect(fixture.text()).toBe("The count is 2");
    expect(fixture.instance).toBe(before);
    expect(setupLog).toEqual(["setup"]);
  });

  it("a method-only edit patches in place: nothing is rebuilt and the live instance uses the new body", async () => {
    setupLog = [];
    const fixture = mount(counter());
    fixture.instance.increment();
    await fixture.flush();
    const before = fixture.instance;
    const node = fixture.root.children[0]!;

    fixture.hotReplace(counter({ step: 5 }));
    fixture.instance.increment();
    await fixture.flush();

    expect(fixture.instance).toBe(before);
    expect(fixture.text()).toBe("Count: 6 double: 12");
    expect(fixture.root.children[0]).toBe(node);
    expect(setupLog).toEqual(["setup"]);
  });
});
