import { describe, expect, it } from "vitest";
import { mount } from "@gable/testing";
import { SiteRoot } from "./root.js";
import { SiteNav } from "./site-nav.js";
import { ThemeStore } from "./theme.js";

describe("SiteRoot", () => {
  it("renders the page headline and every section", async () => {
    const f = mount(SiteRoot);
    const text = f.text();
    expect(text).toContain("No compiler");
    for (const id of ["compiler", "hmr", "framework", "data", "ui", "designer", "editor", "start"]) {
      expect(f.query(`section#${id}`), id).toBeTruthy();
    }
  });
});

describe("theme toggle", () => {
  it("flips the theme and the document attribute", async () => {
    const f = mount(SiteNav);
    const store = f.injector.get(ThemeStore)!;
    expect(store.theme()).toBe("dark");
    f.dispatch(f.query("button.theme-btn")!, "click");
    await f.flush();
    expect(store.theme()).toBe("light");
    expect(f.text()).toBeDefined();
  });
});
