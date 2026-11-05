import { describe, expect, it } from "vitest";
import { html, inject, input, signal } from "@gable/core";
import { form, minLength, required } from "@gable/core/forms";
import { ActiveRoute, type Route } from "@gable/core/router";
import { mount, mountApp } from "@gable/testing";

// TASK-2.15: Form state, router state and route injectors survive hot updates.

describe("form state across a re-setup", () => {
  const v1 = () =>
    class Signup {
      static meta = { selector: "app-signup", template: html`<input class="name" [field]="f.name" /><p class="err">{{ f.name.state.errors().length }}</p><p class="dirty">{{ f.state.dirty() }}</p><p class="t">{{ f.name.state.touched() }}</p>` };
      f = form(signal({ name: "ann" }), (p) => required(p.name));
    };
  const v2 = () =>
    class Signup {
      static meta = { selector: "app-signup", template: html`<input class="name" [field]="f.name" /><p class="err">{{ f.name.state.errors().length }}</p><p class="dirty">{{ f.state.dirty() }}</p><p class="t">{{ f.name.state.touched() }}</p>` };
      extra = 1;
      f = form(signal({ name: "ann" }), (p) => {
        required(p.name);
        minLength(p.name, 5);
      });
    };

  it("keeps value, touched and dirty baseline, and runs the edited schema", async () => {
    const f = mount(v1());
    f.fill(f.query(".name")!, "bob");
    f.blur(f.query(".name")!);
    await f.settle();
    expect(f.text()).toContain("true");
    const result = f.hotReplace(v2());
    expect(result.status).toBe("applied");
    await f.settle();
    expect(f.instance.f.name()).toBe("bob");
    expect(f.instance.f.name.state.touched()).toBe(true);
    expect(f.instance.f.state.dirty()).toBe(true); // baseline stayed "ann"
    expect(f.instance.f.name.state.errors().map((e) => e.kind)).toEqual(["minLength"]);
    f.instance.f.reset();
    expect(f.instance.f.name()).toBe("ann");
  });

  it("keeps touched state and baselines of array rows, and drops removed paths", async () => {
    const mk = (extra: boolean) =>
      class List {
        static meta = { selector: "app-list", template: html`x` };
        extra = extra ? 1 : 0;
        f = form(signal({ tags: [{ v: "a" }, { v: "b" }] }));
      };
    const f = mount(mk(false));
    f.instance.f.tags.rows()[1]!.v.state.markTouched();
    f.instance.f.tags.push({ v: "c" });
    f.hotReplace(mk(true));
    const rows = f.instance.f.tags.rows();
    expect(rows.map((r) => r.v())).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.v.state.touched())).toEqual([false, true, false]);
    expect(rows.map((r) => r.v.state.dirty())).toEqual([false, false, true]);
  });
});
