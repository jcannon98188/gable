import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";

describe("@if / @else", () => {
  class Cond {
    static meta = {
      selector: "app-cond",
      template: html`
        <h1>top</h1>
        @if (a()) {
          <p>A {{ a() }}</p>
        } @else if (b()) {
          <p>B</p>
        } @else {
          <p>none</p>
        }
        <footer>end</footer>
      `,
    };
    a = signal<string | null>(null);
    b = signal(false);
  }

  it("renders the matching branch in place and swaps on change", async () => {
    const f = mount(Cond);
    expect(f.html()).toBe(
      ["<app-cond>", "  <h1>top</h1>", "  <p>none</p>", "  <!---->", "  <footer>end</footer>", "</app-cond>"].join("\n"),
    );
    f.instance.b.set(true);
    await f.flush();
    expect(f.queryAll("p").map((p) => p.children[0]!.text)).toEqual(["B"]);
    f.instance.a.set("x");
    await f.flush();
    expect(f.queryAll("p").map((p) => p.children[0]!.text)).toEqual(["A x"]);
    f.instance.a.set(null);
    f.instance.b.set(false);
    await f.flush();
    expect(f.queryAll("p").map((p) => p.children[0]!.text)).toEqual(["none"]);
    // order is preserved: block content sits between h1 and footer
    expect(f.root.children.map((c) => c.tag ?? c.kind)).toEqual(["h1", "p", "anchor", "footer"]);
  });

  it("keeps the branch (and its DOM) while the branch stays the same, and updates its alias", async () => {
    class Alias {
      static meta = {
        selector: "app-alias",
        template: html`@if (user(); as u) {<b>{{ u.name }}</b>} @else {<i>nobody</i>}`,
      };
      user = signal<{ name: string } | null>({ name: "Ada" });
    }
    const f = mount(Alias);
    const b = f.query("b")!;
    expect(f.text()).toBe("Ada");
    f.instance.user.set({ name: "Grace" });
    await f.flush();
    expect(f.query("b")).toBe(b);
    expect(f.text()).toBe("Grace");
    f.instance.user.set(null);
    await f.flush();
    expect(f.text()).toBe("nobody");
    expect(f.query("b")).toBeNull();
  });

  it("tears down the old branch's effects", async () => {
    class Torn {
      static meta = { selector: "app-torn", template: html`@if (on()) {<p>{{ count() }}</p>}` };
      on = signal(true);
      count = signal(0);
    }
    const f = mount(Torn);
    const p = f.query("p")!;
    f.instance.on.set(false);
    await f.flush();
    f.instance.count.set(9);
    await f.flush();
    expect(p.children[0]!.text).toBe("0");
  });
});

describe("@switch", () => {
  class Sw {
    static meta = {
      selector: "app-sw",
      template: html`@switch (mode()) {
        @case ('a') {<p>is a</p>}
        @case ('b') {<p>is b</p>}
        @default {<p>other</p>}
      }`,
    };
    mode = signal("a");
  }
  it("selects a case, falling back to default", async () => {
    const f = mount(Sw);
    expect(f.text()).toBe("is a");
    f.instance.mode.set("b");
    await f.flush();
    expect(f.text()).toBe("is b");
    f.instance.mode.set("zzz");
    await f.flush();
    expect(f.text()).toBe("other");
  });
});

describe("@let", () => {
  it("declares a reactive template-local value", async () => {
    class L {
      static meta = {
        selector: "app-l",
        template: html`@let who = user()?.name ?? 'guest';<p>Hi {{ who }}</p>`,
      };
      user = signal<{ name: string } | null>(null);
    }
    const f = mount(L);
    expect(f.text()).toBe("Hi guest");
    f.instance.user.set({ name: "Ada" });
    await f.flush();
    expect(f.text()).toBe("Hi Ada");
  });
});
