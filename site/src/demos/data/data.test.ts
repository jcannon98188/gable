import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary, html } from "@gable/core";
import { mount } from "@gable/testing";
import { FormDemo } from "./form-demo.js";
import { I18nDemo } from "./i18n-demo.js";
import { CartStore, StoreDemo } from "./store-demo.js";
import { catalogs } from "./catalogs.js";
import { Data } from "../../data.js";

const advanceTimers = async (ms: number) => void (await vi.advanceTimersByTimeAsync(ms));

describe("signal form demo", () => {
  it("validates live, runs the async and cross-field rules and submits the value", async () => {
    vi.useFakeTimers();
    try {
      const f = mount(FormDemo, { advanceTimers });
      const handle = f.query("#dd-handle")!;
      expect(f.text()).toContain("1 error");
      f.fill(handle, "ad");
      f.dispatch(handle, "blur");
      await f.flush();
      expect(f.text()).toContain("At least 3 characters.");
      f.fill(handle, "ada");
      await f.flush();
      await f.advance(300);
      expect(f.text()).toContain("Checking availability");
      await f.advance(400);
      expect(f.text()).toContain("That handle is taken");
      f.fill(handle, "newcomer");
      await f.flush();
      await f.advance(700);
      expect(f.text()).not.toContain("taken");
      expect(f.instance.f.handle.state.valid()).toBe(true);

      f.fill(f.query("#dd-pw")!, "correct horse");
      f.fill(f.query("#dd-confirm")!, "nope");
      f.dispatch(f.query("#dd-confirm")!, "blur");
      await f.flush();
      expect(f.text()).toContain("Does not match the password.");
      f.fill(f.query("#dd-confirm")!, "correct horse");
      await f.flush();
      expect(f.text()).not.toContain("Does not match");

      f.fill(f.query("#dd-email")!, "me@example.com");
      await f.flush();
      f.dispatch(f.query("form")!, "submit", { preventDefault() {} });
      await f.flush();
      await f.advance(10);
      expect(f.text()).toContain("Please accept the terms.");
      expect(f.instance.submitted()).toBeUndefined();

      f.fill(f.query("input[type=checkbox]")!, true);
      await f.flush();
      f.dispatch(f.query("form")!, "submit", { preventDefault() {} });
      await f.advance(600);
      await f.flush();
      expect(f.instance.submitted()).toMatchObject({ handle: "newcomer", email: "me@example.com", terms: true });
      expect(f.text()).toContain("Submitted.");
      expect(f.text()).not.toContain("correct horse");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("i18n demo", () => {
  const text = (f: ReturnType<typeof mount<I18nDemo>>) => f.text();

  it("renders plurals, selects, numbers and dates per locale, switching live", async () => {
    const f = mount(I18nDemo);
    expect(text(f)).toContain("3 unread messages");
    expect(text(f)).toContain("She replied to your thread");
    expect(text(f)).toContain("1,234,567 downloads since March 14, 2024");
    expect(text(f)).toContain("Balance: $1,234.50");

    f.instance.unread.set(1);
    await f.flush();
    expect(text(f)).toContain("1 unread message");
    expect(text(f)).not.toContain("1 unread messages");

    f.instance.pick("fr");
    await f.flush();
    expect(text(f)).toContain("1 message non lu");
    expect(text(f)).toContain("Elle a répondu");
    expect(text(f)).toContain("14 mars 2024");
    expect(f.instance.dir()).toBe("ltr");

    f.instance.pick("ar");
    await f.flush();
    expect(f.instance.dir()).toBe("rtl");
    expect(f.query("[dir=rtl]")).toBeTruthy();
    expect(text(f)).toContain(catalogs.ar.title);
    f.instance.unread.set(2);
    await f.flush();
    expect(text(f)).toContain("رسالتان غير مقروءتين");
  });

  it("falls back to the source text and lists the ids a partial catalog lacks", async () => {
    const f = mount(I18nDemo);
    f.instance.pick("de");
    await f.flush();
    expect(text(f)).toContain("Ihr Posteingang");
    expect(text(f)).toContain("female replied to your thread");
    expect(text(f)).toContain("Balance: 1234.5");
    expect(f.instance.missing()).toEqual(["reply", "balance", "saved"]);
    expect(text(f)).toContain("Missing in");
    f.instance.pick("en");
    await f.flush();
    expect(f.instance.missing()).toEqual([]);
  });
});

describe("store demo", () => {
  it("runs actions through patchState and shows state and derived values live", async () => {
    const f = mount(StoreDemo);
    const add = (n: number) => f.dispatch(f.queryAll("ul[aria-label=Products] button")[n]!, "click");
    expect(f.text()).toContain("Empty. Add something above.");
    add(1);
    add(1);
    add(0);
    await f.flush();
    expect(f.text()).toContain("Cart (3)");
    expect(f.text()).toContain("Gable tee x 2");
    expect(f.text()).toContain("$56.00");
    expect(JSON.parse(f.textOf(f.query("pre")!))).toEqual({ lines: [{ sku: "tee", qty: 2 }, { sku: "pin", qty: 1 }], coupon: false });

    f.dispatch(f.query("input[type=checkbox]")!, "change");
    await f.flush();
    expect(f.text()).toContain("-$5.60");
    expect(f.text()).toContain("$50.40");

    f.dispatch(f.queryAll("ul[aria-label=Cart] button")[0]!, "click");
    await f.flush();
    expect(f.instance.store.count()).toBe(2);
    const store = f.instance.store as CartStore;
    expect(store.total()).toBe(2400 + 800 - 320);

    f.dispatch(f.queryAll("button").find((b) => f.textOf(b) === "Empty cart")!, "click");
    await f.flush();
    expect(f.text()).toContain("Empty. Add something above.");
  });
});

describe("isolation", () => {
  it("a demo that fails shows its fallback and leaves the siblings alone", async () => {
    class Broken {
      static meta = { selector: "data-form-demo", template: html`<p>never</p>` };
      boom = (() => {
        throw new Error("demo failed");
      })();
    }
    class Root {
      static meta = {
        selector: "app-root",
        imports: [ErrorBoundary, Broken, StoreDemo],
        template: html`<gable-error-boundary><data-form-demo></data-form-demo><p slot="fallback">fallback</p></gable-error-boundary><data-store-demo></data-store-demo>`,
      };
    }
    const f = mount(Root);
    expect(f.claimErrors()).toHaveLength(1);
    await f.flush();
    expect(f.text()).toContain("fallback");
    expect(f.text()).toContain("Empty. Add something above.");
  });

  it("the Data section mounts all three demos", async () => {
    const f = mount(Data);
    expect(f.query("data-form-demo")).toBeTruthy();
    expect(f.query("data-i18n-demo")).toBeTruthy();
    expect(f.query("data-store-demo")).toBeTruthy();
  });
});
