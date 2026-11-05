// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bootstrap, html, signal } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { email, form, required } from "@gable/core/forms";
import { dom } from "./index.js";

describe("[field] on the DOM renderer", () => {
  class Signup {
    static meta = {
      selector: "app-signup",
      template: html`
        <input class="email" [field]="f.email" />
        <input class="age" type="number" [field]="f.age" />
        <input class="terms" type="checkbox" [field]="f.terms" />
        <select class="color" [field]="f.color"><option value="red">r</option><option value="blue">b</option></select>
        <input class="a" type="radio" name="plan" value="a" [field]="f.plan" />
        <input class="b" type="radio" name="plan" value="b" [field]="f.plan" />
      `,
    };
    f = form(signal({ email: "", age: null as number | null, terms: false, color: "blue", plan: "b" }), (p) => {
      required(p.email);
      email(p.email);
    });
  }

  const start = () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = bootstrap(Signup, { renderer: dom(), target: "#app" });
    const q = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
    return { app, q, f: (app.instance as Signup).f };
  };
  const type = (el: HTMLInputElement, value: string, event = "input") => {
    el.value = value;
    el.dispatchEvent(new Event(event, { bubbles: true }));
  };

  it("shows initial values, including select and radio", () => {
    const { q, app } = start();
    expect(q<HTMLSelectElement>(".color").value).toBe("blue");
    expect(q<HTMLInputElement>(".b").checked).toBe(true);
    expect(q<HTMLInputElement>(".a").checked).toBe(false);
    app.destroy();
  });

  it("writes edits back with type-aware values and reads model changes into the controls", async () => {
    const { q, f, app } = start();
    type(q(".email"), "a@b.co");
    type(q(".age"), "42");
    expect(f()).toMatchObject({ email: "a@b.co", age: 42 });
    type(q(".age"), "");
    expect(f.age()).toBeNull();
    const terms = q<HTMLInputElement>(".terms");
    terms.checked = true;
    terms.dispatchEvent(new Event("change", { bubbles: true }));
    expect(f.terms()).toBe(true);
    const color = q<HTMLSelectElement>(".color");
    color.value = "red";
    color.dispatchEvent(new Event("change", { bubbles: true }));
    expect(f.color()).toBe("red");
    const a = q<HTMLInputElement>(".a");
    a.checked = true;
    a.dispatchEvent(new Event("change", { bubbles: true }));
    expect(f.plan()).toBe("a");
    f.email.set("z@z.zz");
    f.plan.set("b");
    await whenFlushed();
    expect(q<HTMLInputElement>(".email").value).toBe("z@z.zz");
    expect(q<HTMLInputElement>(".b").checked).toBe(true);
    app.destroy();
  });

  it("marks touched on blur and sets aria-invalid from the field's errors", async () => {
    const { q, f, app } = start();
    const el = q<HTMLInputElement>(".email");
    expect(f.email.state.touched()).toBe(false);
    el.dispatchEvent(new Event("blur"));
    expect(f.email.state.touched()).toBe(true);
    expect(el.getAttribute("aria-invalid")).toBe("true");
    type(el, "ok@ok.io");
    await whenFlushed();
    expect(el.hasAttribute("aria-invalid")).toBe(false);
    app.destroy();
  });
});
