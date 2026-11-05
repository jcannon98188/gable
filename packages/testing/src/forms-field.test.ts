import { describe, expect, it, vi } from "vitest";
import { Observable, delay, of, switchMap } from "rxjs";
import { html, input, model, output, signal, computed } from "@gable/core";
import { disabled, email, form, minLength, required, validateAsync } from "@gable/core/forms";
import { mount } from "@gable/testing";

describe("[field] on native controls", () => {
  class Signup {
    static meta = {
      selector: "app-signup",
      template: html`
        <input class="email" [field]="f.email" />
        <input class="age" type="number" [field]="f.age" />
        <input class="terms" type="checkbox" [field]="f.terms" />
        <input class="a" type="radio" value="a" [field]="f.plan" />
        <input class="b" type="radio" value="b" [field]="f.plan" />
        <select class="color" [field]="f.color"><option value="red">r</option><option value="blue">b</option></select>
        <textarea class="bio" [field]="f.bio"></textarea>
        <input class="date" type="date" [field]="f.date" />
        <p class="errors">{{ firstError() }}</p>
      `,
    };
    f = form(signal({ email: "", age: null as number | null, terms: false, plan: "a", color: "blue", bio: "", date: "2020-01-02" }), (p) => {
      required(p.email);
      email(p.email);
      disabled(p.bio, ({ root }) => root.terms());
    });
    firstError = computed(() => this.f.email.state.errors()[0]?.kind ?? "");
  }

  it("shows model values in controls by element type", () => {
    const t = mount(Signup);
    expect(t.query(".email")!.props.value).toBe("");
    expect(t.query(".terms")!.props.checked).toBe(false);
    expect(t.query(".a")!.props.checked).toBe(true);
    expect(t.query(".b")!.props.checked).toBe(false);
    expect(t.query(".color")!.props.value).toBe("blue");
    expect(t.query(".date")!.props.value).toBe("2020-01-02");
    expect(t.query(".age")!.props.value).toBe("");
  });

  it("writes user edits back to the model, mapped by type", async () => {
    const t = mount(Signup);
    t.fill(t.query(".email")!, "a@b.co");
    t.fill(t.query(".age")!, "42");
    t.fill(t.query(".terms")!, true);
    t.fill(t.query(".b")!, true);
    t.fill(t.query(".color")!, "red");
    t.fill(t.query(".date")!, "2021-05-06");
    expect(t.instance.f()).toEqual({ email: "a@b.co", age: 42, terms: true, plan: "b", color: "red", bio: "", date: "2021-05-06" });
    await t.flush();
    expect(t.query(".a")!.props.checked).toBe(false);
    expect(t.query(".b")!.props.checked).toBe(true);
    t.fill(t.query(".age")!, "");
    expect(t.instance.f.age()).toBeNull();
  });

  it("pushes model changes into the controls", async () => {
    const t = mount(Signup);
    t.instance.f.email.set("x@y.zz");
    t.instance.f.age.set(7);
    await t.flush();
    expect(t.query(".email")!.props.value).toBe("x@y.zz");
    expect(t.query(".age")!.props.value).toBe("7");
  });

  it("marks the field touched on blur and applies disabled and aria-invalid", async () => {
    const t = mount(Signup);
    const email = t.query(".email")!;
    expect(t.instance.f.email.state.touched()).toBe(false);
    t.blur(email);
    expect(t.instance.f.email.state.touched()).toBe(true);
    expect(email.attrs["aria-invalid"]).toBe("true");
    expect(t.text()).toContain("required");
    t.fill(email, "a@b.co");
    await t.flush();
    expect(email.attrs["aria-invalid"]).toBeUndefined();
    expect(t.query(".bio")!.props.disabled).toBe(false);
    t.fill(t.query(".terms")!, true);
    await t.flush();
    expect(t.query(".bio")!.props.disabled).toBe(true);
  });

  it("binds rows from rows() and follows them through reorders", async () => {
    class Rows {
      static meta = {
        selector: "app-rows",
        template: html`@for (row of f.items.rows(); track row.state.key) { <input class="item" [field]="row.name" /> }`,
      };
      f = form(signal({ items: [{ name: "a" }, { name: "b" }] }));
    }
    const t = mount(Rows);
    const [first] = t.queryAll(".item");
    t.fill(first!, "A");
    t.instance.f.items.move(0, 1);
    await t.flush();
    expect(t.queryAll(".item").map((i) => i.props.value)).toEqual(["b", "A"]);
    expect(t.queryAll(".item")[1]).toBe(first);
    t.fill(first!, "AA");
    expect(t.instance.f.items()).toEqual([{ name: "b" }, { name: "AA" }]);
  });

  it("reports a [field] bound to something that is not a field", async () => {
    class Bad {
      static meta = { selector: "app-bad", template: html`<input [field]="plain" />` };
      plain = signal("x");
    }
    const t = mount(Bad);
    const reports = t.errors.expect("binding");
    expect(reports).toHaveLength(1);
    expect(String(reports[0]!.error)).toMatch(/\[field\] must be bound to a form field/);
  });

  it("stops listening when destroyed", () => {
    const t = mount(Signup);
    const el = t.query(".email")!;
    t.destroy();
    t.fill(el, "late@x.io");
    expect(t.instance.f.email()).toBe("");
  });
});

describe("[field] on custom controls", () => {
  class Rating {
    static meta = { selector: "app-rating", template: html`<button class="pick" (click)="pick()">pick</button><span class="v">{{ value() }}</span><i>{{ state() }}</i>` };
    value = model<number | null>(null);
    disabled = input(false);
    invalid = input(false);
    errors = input<unknown[]>([]);
    touched = output();
    state = computed(() => `${this.disabled() ? "disabled" : "enabled"}/${this.invalid() ? "invalid" : "ok"}/${this.errors().length}`);
    pick() {
      this.value.set(4);
      this.touched.emit();
    }
  }

  class Page {
    static meta = { selector: "app-page", imports: [Rating], template: html`<app-rating [field]="f.stars" />` };
    f = form(signal({ stars: null as number | null }), (p) => {
      required(p.stars);
      disabled(p.stars, ({ root }) => root.stars() === 99);
    });
  }

  it("fills value and the optional inputs from the field", async () => {
    const t = mount(Page);
    expect(t.query(".v")!.children[0]!.text).toBe("");
    expect(t.text()).toContain("enabled/invalid/1");
    t.instance.f.stars.set(3);
    await t.flush();
    expect(t.query(".v")!.children[0]!.text).toBe("3");
    expect(t.text()).toContain("enabled/ok/0");
    t.instance.f.stars.set(99);
    await t.flush();
    expect(t.text()).toContain("disabled/ok/0");
  });

  it("writes the control's value changes back and marks the field touched from its touched output", () => {
    const t = mount(Page);
    expect(t.instance.f.stars.state.touched()).toBe(false);
    t.dispatch(t.query(".pick")!, "click");
    expect(t.instance.f.stars()).toBe(4);
    expect(t.instance.f.stars.state.touched()).toBe(true);
  });
});

describe("a complete form through the Fixture", () => {
  class Register {
    static meta = {
      selector: "app-register",
      template: html`
        <input class="name" [field]="f.name" />
        <input class="pw" [field]="f.pw" />
        <button class="go" (click)="send()">Go</button>
        <p class="status">{{ status() }}</p>
        <p class="pending">{{ pendingText() }}</p>
        <p class="name-error">{{ nameError() }}</p>
      `,
    };
    taken = new Set(["ada"]);
    f = form(signal({ name: "", pw: "" }), (p) => {
      required(p.name);
      minLength(p.pw, 6);
      validateAsync(p.name, (v$: Observable<string>) => v$.pipe(switchMap((v) => of(this.taken.has(v) ? { kind: "taken" } : null).pipe(delay(200)))));
    });
    status = signal("idle");
    pendingText = computed(() => (this.f.name.state.pending() ? "checking" : ""));
    nameError = computed(() => this.f.name.state.errors()[0]?.kind ?? "");
    sent: unknown[] = [];
    async send() {
      const result = await this.f.submit(async (value) => {
        this.sent.push(value);
        if (value.name === "bob") return { name: [{ kind: "reserved" }] };
      });
      this.status.set(result);
    }
  }

  it("validates sync and async, submits, and shows server errors", async () => {
    vi.useFakeTimers();
    try {
      const t = mount(Register, { advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) });
      const go = t.query(".go")!;
      t.dispatch(go, "click");
      await t.settle();
      expect(t.query(".status")!.children[0]!.text).toBe("invalid");
      expect(t.instance.sent).toEqual([]);

      t.fill(t.query(".name")!, "ada");
      t.fill(t.query(".pw")!, "secret1");
      await t.flush();
      expect(t.query(".pending")!.children[0]!.text).toBe("checking");
      t.dispatch(go, "click");
      await t.flush();
      expect(t.instance.sent).toEqual([]);
      await t.advance(200);
      expect(t.query(".name-error")!.children[0]!.text).toBe("taken");

      t.fill(t.query(".name")!, "bob");
      await t.flush();
      await t.advance(200);
      expect(t.text()).not.toContain("taken");
      t.dispatch(go, "click");
      await t.advance(1);
      expect(t.instance.sent).toEqual([{ name: "bob", pw: "secret1" }]);
      expect(t.text()).toContain("serverErrors");
      expect(t.text()).toContain("reserved");
      t.fill(t.query(".name")!, "bobby");
      await t.advance(200);
      expect(t.text()).not.toContain("reserved");
      t.dispatch(go, "click");
      await t.advance(1);
      expect(t.text()).toContain("ok");
    } finally {
      vi.useRealTimers();
    }
  });
});
