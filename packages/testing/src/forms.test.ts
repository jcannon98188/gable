import { describe, expect, it } from "vitest";
import { computed, html, signal } from "@gable/core";
import { form, email, max, maxLength, min, minLength, pattern, required, requiredTrue, validate, apply, applyWhen, disabled, type Path } from "@gable/core/forms";
import { mount } from "@gable/testing";

/** A component whose only job is to own a form, so tests go through the Fixture. */
function host<F>(make: () => F) {
  class Host {
    static meta = { selector: "app-host", template: html`<p>host</p>` };
    f = make();
  }
  return mount(Host);
}

describe("form tree", () => {
  it("derives writable signals from the model; child writes update the parent immutably", () => {
    const model = signal({ name: "Ada", address: { city: "London" } });
    const before = model();
    const t = host(() => form(model));
    const f = t.instance.f;
    expect(f()).toEqual({ name: "Ada", address: { city: "London" } });
    expect(f.name()).toBe("Ada");
    f.address.city.set("Paris");
    expect(model()).toEqual({ name: "Ada", address: { city: "Paris" } });
    expect(model()).not.toBe(before);
    expect(before.address.city).toBe("London");
    f.name.update((n) => n + "!");
    expect(model().name).toBe("Ada!");
    model.set({ name: "Bo", address: { city: "Rome" } });
    expect(f.address.city()).toBe("Rome");
    f.set({ name: "Cy", address: { city: "Oslo" } });
    expect(model().name).toBe("Cy");
  });

  it("keeps sibling reads quiet when another field changes", async () => {
    const model = signal({ a: 1, b: 2 });
    let reads = 0;
    class Probe {
      static meta = { selector: "app-probe", template: html`<p>{{ seen() }}</p>` };
      f = form(model);
      seen = computed(() => (reads++, this.f.a()));
    }
    const t = mount(Probe);
    expect(reads).toBe(1);
    t.instance.f.b.set(3);
    await t.flush();
    expect(t.text()).toBe("1");
    expect(reads).toBe(1);
    t.instance.f.a.set(9);
    await t.flush();
    expect(t.text()).toBe("9");
  });

  it("rejects a model key named state, at any depth", () => {
    expect(() => host(() => form(signal({ state: "CA" })))).toThrow(/"state".*reserved/s);
    expect(() => host(() => form(signal({ a: { b: [{ state: 1 }] } })))).toThrow(/a\.b\.0\.state/);
  });

  it("must be created during setup unless given a scope", () => {
    expect(() => form(signal({ a: 1 }))).toThrow(/during setup/);
  });
});

describe("sync rules", () => {
  const signup = () => {
    const model = signal({ email: "", name: "ab", age: 5 as number | null, terms: false, pw: "", pw2: "" });
    return host(() =>
      form(model, (p) => {
        required(p.email);
        email(p.email, { message: "Not an email" });
        minLength(p.name, 3);
        maxLength(p.name, 5);
        min(p.age, 18);
        max(p.age, 99);
        pattern(p.pw, /\d/);
        requiredTrue(p.terms);
        validate(p.pw2, (v, { root }) => (v === root.pw() ? null : { kind: "mismatch" }));
      }),
    );
  };

  it("reports built-in rules as error objects, reactive to changes", () => {
    const f = signup().instance.f;
    expect(f.email.state.errors()).toEqual([{ kind: "required" }]);
    f.email.set("nope");
    expect(f.email.state.errors()).toEqual([{ kind: "email", message: "Not an email" }]);
    f.email.set("a@b.co");
    expect(f.email.state.errors()).toEqual([]);
    expect(f.name.state.errors()).toEqual([{ kind: "minLength", min: 3, actual: 2 }]);
    f.name.set("abcdef");
    expect(f.name.state.errors()).toEqual([{ kind: "maxLength", max: 5, actual: 6 }]);
    expect(f.age.state.errors()).toEqual([{ kind: "min", min: 18, actual: 5 }]);
    f.age.set(null);
    expect(f.age.state.errors()).toEqual([]);
    f.age.set(100);
    expect(f.age.state.errors()).toEqual([{ kind: "max", max: 99, actual: 100 }]);
    expect(f.terms.state.errors()).toEqual([{ kind: "requiredTrue" }]);
    f.pw.set("abc");
    expect(f.pw.state.errors()).toEqual([{ kind: "pattern", pattern: "\\d" }]);
  });

  it("required treats null, undefined, empty string and empty array as empty", () => {
    const t = host(() =>
      form(signal({ s: "", n: null as number | null, u: undefined as string | undefined, a: [] as string[], zero: 0, no: false }), (p) => {
        required(p.s);
        required(p.n);
        required(p.u);
        required(p.a);
        required(p.zero);
        required(p.no);
      }),
    );
    const f = t.instance.f;
    expect(f.s.state.errors()).toHaveLength(1);
    expect(f.n.state.errors()).toHaveLength(1);
    expect(f.u.state.errors()).toHaveLength(1);
    expect(f.a.state.errors()).toHaveLength(1);
    expect(f.zero.state.errors()).toEqual([]);
    expect(f.no.state.errors()).toEqual([]);
  });

  it("validators read other fields reactively", () => {
    const f = signup().instance.f;
    f.pw.set("a1");
    f.pw2.set("a1");
    expect(f.pw2.state.errors()).toEqual([]);
    f.pw.set("b2");
    expect(f.pw2.state.errors()).toEqual([{ kind: "mismatch" }]);
  });

  it("aggregates errors, validity, touched and dirty up the tree", () => {
    const f = signup().instance.f;
    expect(f.state.valid()).toBe(false);
    expect(f.state.allErrors().map((e) => e.path)).toContain("email");
    expect(f.state.allErrors().find((e) => e.path === "name")?.error.kind).toBe("minLength");
    expect(f.state.dirty()).toBe(false);
    f.name.set("abcd");
    expect(f.name.state.dirty()).toBe(true);
    expect(f.state.dirty()).toBe(true);
    expect(f.email.state.dirty()).toBe(false);
    f.name.set("ab");
    expect(f.state.dirty()).toBe(false);
    expect(f.state.touched()).toBe(false);
    f.email.state.markTouched();
    expect(f.state.touched()).toBe(true);
    expect(f.name.state.touched()).toBe(false);
  });

  it("has a stable key per field", () => {
    const f = signup().instance.f;
    expect(f.email.state.key).toBe("email");
  });
});

describe("composition and conditional state", () => {
  interface Address {
    street: string;
    zip: string;
  }
  const addressSchema = (p: Path<Address>) => {
    required(p.street);
    minLength(p.zip, 5);
  };

  it("composes schemas with apply, including on nested paths", () => {
    const f = host(() =>
      form(signal({ home: { street: "", zip: "1" }, work: { street: "x", zip: "12345" } }), (p) => {
        apply(p.home, addressSchema);
        apply(p.work, addressSchema);
      }),
    ).instance.f;
    expect(f.home.street.state.errors()).toEqual([{ kind: "required" }]);
    expect(f.home.zip.state.errors()).toHaveLength(1);
    expect(f.work.state.valid()).toBe(true);
    expect(f.home.state.allErrors().map((e) => e.path)).toEqual(["home.street", "home.zip"]);
  });

  it("applies rules only while applyWhen's condition holds", () => {
    const f = host(() =>
      form(signal({ shipSame: true, street: "" }), (p) => {
        applyWhen(p.street, ({ root }) => !root.shipSame(), (s) => required(s));
      }),
    ).instance.f;
    expect(f.street.state.errors()).toEqual([]);
    f.shipSame.set(false);
    expect(f.street.state.errors()).toEqual([{ kind: "required" }]);
  });

  it("skips disabled fields in validation and parent validity, but never strips their value", () => {
    const model = signal({ code: "", other: "x" });
    const f = host(() =>
      form(model, (p) => {
        required(p.code);
        disabled(p.code, ({ root }) => root.other() === "x");
      }),
    ).instance.f;
    expect(f.code.state.disabled()).toBe(true);
    expect(f.code.state.errors()).toEqual([]);
    expect(f.state.valid()).toBe(true);
    expect(model()).toEqual({ code: "", other: "x" });
    f.other.set("y");
    expect(f.code.state.disabled()).toBe(false);
    expect(f.state.valid()).toBe(false);
  });

  it("disabling a group disables its fields", () => {
    const f = host(() =>
      form(signal({ a: { b: "" } }), (p) => {
        required(p.a.b);
        disabled(p.a);
      }),
    ).instance.f;
    expect(f.a.b.state.disabled()).toBe(true);
    expect(f.state.valid()).toBe(true);
  });
});
