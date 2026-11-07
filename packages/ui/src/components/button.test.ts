import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { UiButton, buttonVariants } from "./button.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiButton],
    template: html`<button uiButton>Plain</button>
      <button uiButton variant="outline" size="sm" class="mt-4 h-12">Outlined</button>
      <button uiButton [variant]="variant()">Dynamic</button>`,
  };
  variant = signal<"default" | "destructive">("default");
}

describe("Button", () => {
  it("computes the default variant classes", async () => {
    const f = mount(App);
    await f.settle();
    const [plain] = f.queryAll("button");
    expect(plain!.attrs.class).toContain("bg-primary");
    expect(plain!.attrs.class).toContain("h-9");
  });

  it("reads variant and size from static attributes and merges the user's class last", async () => {
    const f = mount(App);
    await f.settle();
    const outlined = f.queryAll("button")[1]!;
    expect(outlined.attrs.class).toContain("border");
    expect(outlined.attrs.class).toContain("mt-4");
    // tailwind-merge: the user's h-12 replaces the size's h-8
    expect(outlined.attrs.class).toContain("h-12");
    expect(outlined.attrs.class).not.toContain("h-8");
    expect(outlined.attrs.class).not.toContain("bg-primary");
  });

  it("follows a bound variant", async () => {
    const f = mount(App);
    await f.settle();
    const dynamic = f.queryAll("button")[2]!;
    expect(dynamic.attrs.class).toContain("bg-primary");
    f.instance.variant.set("destructive");
    await f.settle();
    expect(dynamic.attrs.class).toContain("bg-destructive");
    expect(dynamic.attrs.class).not.toContain("bg-primary");
  });

  it("buttonVariants is a plain function for other components", () => {
    expect(buttonVariants({ variant: "link", size: "icon" })).toContain("size-9");
  });
});
