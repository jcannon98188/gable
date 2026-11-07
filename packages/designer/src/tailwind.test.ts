import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { VERIFIED_TAILWIND, loadDesignSystem, shapeProblem } from "./server/tailwind/design-system.js";
import { TailwindModel, conflicts, forceRules, splitToken } from "./server/tailwind/model.js";
import { formatterSortsClasses } from "./server/tailwind/api.js";

const FIXTURE = fileURLToPath(new URL("../test-fixtures/tailwind-app", import.meta.url));

let model: TailwindModel;
let sorted: TailwindModel;
beforeAll(async () => {
  const loaded = await loadDesignSystem(FIXTURE);
  if (!loaded.ok) throw new Error(loaded.message);
  expect(loaded.version.startsWith("4")).toBe(true);
  model = new TailwindModel(loaded.ds, { version: loaded.version, source: loaded.source, entry: loaded.entry, sortsClasses: false });
  sorted = new TailwindModel(loaded.ds, { version: loaded.version, source: loaded.source, entry: loaded.entry, sortsClasses: true });
});

describe("tailwind: loading the project's design system", () => {
  it("is off with a clear message when the project does not use Tailwind v4", async () => {
    const root = mkdtempSync(join(tmpdir(), "gable-notw-"));
    writeFileSync(join(root, "app.css"), "body { margin: 0 }\n");
    const r = await loadDesignSystem(root);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("does not use Tailwind v4");
    writeFileSync(join(root, "v3.css"), "@tailwind base;\n@tailwind utilities;\n");
    const v3 = await loadDesignSystem(root);
    expect(!v3.ok && v3.message).toContain("Tailwind v3");
  });

  it("reports an API shape it does not know instead of throwing", () => {
    expect(shapeProblem({})).toContain("theme");
    expect(shapeProblem(null)).toBeTruthy();
    expect(VERIFIED_TAILWIND).toMatch(/^4\./);
  });

  it("reads the project's breakpoints, not the v4 defaults", () => {
    const bps = Object.fromEntries(model.breakpoints.map((b) => [b.name, b.min]));
    expect(bps.md).toBe(800); // overridden in the fixture's @theme
    expect(bps["3xl"]).toBe(1900); // added by it
    expect(bps.sm).toBe(640); // 40rem, converted
    expect(model.breakpoints.map((b) => b.min)).toEqual([...model.breakpoints.map((b) => b.min)].sort((a, b) => a - b));
  });

  it("offers the toolbar's state variants the design system has", () => {
    const info = model.info();
    expect(info.enabled && info.states).toEqual(expect.arrayContaining(["hover", "focus", "disabled", "group-hover", "dark"]));
  });
});

describe("tailwind: scales come from the project theme", () => {
  it("lists the spacing scale with resolved values", () => {
    const p = model.options("padding");
    expect(p.find((o) => o.utility === "p-4")).toMatchObject({ label: "4", detail: "1rem" });
    expect(p.find((o) => o.utility === "p-0.5")?.detail).toBe("0.125rem");
  });

  it("lists custom theme colors, radii, and keeps text size apart from text color", () => {
    const bg = model.options("background-color");
    expect(bg.find((o) => o.utility === "bg-brand")).toMatchObject({ swatch: "#ff0066" });
    expect(model.options("border-radius").find((o) => o.utility === "rounded-blob")?.detail).toBe("40% 60%");
    const sizes = model.options("font-size").map((o) => o.utility);
    expect(sizes).toContain("text-sm");
    expect(sizes).not.toContain("text-red-500");
    expect(model.options("color").map((o) => o.utility)).toContain("text-red-500");
    expect(model.options("color").map((o) => o.utility)).not.toContain("text-sm");
  });

  it("offers choices from the design system's own utilities", () => {
    expect(model.options("display").map((o) => o.utility)).toEqual(expect.arrayContaining(["flex", "grid", "hidden"]));
    expect(model.options("justify-content").map((o) => o.utility)).toEqual(expect.arrayContaining(["justify-between", "justify-center"]));
    expect(model.options("shadow").map((o) => o.utility)).toContain("shadow-md");
    expect(model.options("shadow").map((o) => o.utility)).not.toContain("shadow-red-500");
  });
});

describe("tailwind: conflicts are judged by the CSS properties classes set", () => {
  const plan = (classes: string, utility: string, breakpoint: string | null = null, states: string[] = []) => {
    const r = model.plan({ classes, utility, breakpoint, states });
    if (!r.ok) throw new Error(r.error);
    return r;
  };

  it("replaces a class that sets the same property, leaves the rest", () => {
    const r = plan("flex p-4 text-sm box", "p-8");
    expect(r.classes).toBe("flex text-sm box p-8");
    expect(r.removed).toEqual(["p-4"]);
  });

  it("keeps a narrower class next to a broader one (px next to p), replaces when the new one is broader", () => {
    expect(plan("p-4", "px-2").classes).toBe("p-4 px-2");
    expect(plan("px-2 py-1", "p-4").classes).toBe("p-4");
    expect(conflicts(["padding-inline"], ["padding"])).toBe(false);
  });

  it("does not mistake a class that only reads a shared variable for a conflict (text-lg next to leading-6)", () => {
    expect(plan("text-sm leading-6", "text-lg").classes).toBe("leading-6 text-lg");
    expect(plan("text-sm leading-6", "leading-8").classes).toBe("text-sm leading-8");
    expect(plan("shadow-md ring-2", "shadow-lg").classes).toBe("ring-2 shadow-lg");
    expect(plan("text-red-500 text-sm", "text-blue-500").classes).toBe("text-sm text-blue-500");
  });

  it("writes arbitrary values and theme values from plugins and custom themes", () => {
    expect(plan("w-4", "w-[137px]").classes).toBe("w-[137px]");
    expect(plan("", "bg-brand").classes).toBe("bg-brand");
    expect(plan("rounded-md", "rounded-blob").classes).toBe("rounded-blob");
  });

  it("refuses a name the design system does not know", () => {
    const r = model.plan({ classes: "p-4", utility: "not-a-real-class", breakpoint: null, states: [] });
    expect(r.ok).toBe(false);
  });

  it("compares only classes with the same variants: md:p-8 leaves p-4 alone", () => {
    const r = plan("p-4 md:p-2 hover:p-1", "p-8", "md");
    expect(r.token).toBe("md:p-8");
    expect(r.classes).toBe("p-4 hover:p-1 md:p-8");
    expect(plan("p-4", "bg-brand", "md", ["hover", "dark"]).token).toBe("dark:md:hover:bg-brand");
  });

  it("removes the class at exactly the edited context", () => {
    const r = model.plan({ classes: "p-4 md:p-8", remove: ["md:p-8"], breakpoint: "md", states: [] });
    expect(r).toMatchObject({ ok: true, classes: "p-4" });
  });

  it("writes a typed class as typed (variants included) and replaces within those variants", () => {
    const r = model.plan({ classes: "hover:bg-red-500 bg-brand", token: "hover:bg-blue-500", breakpoint: null, states: [] });
    expect(r).toMatchObject({ ok: true, classes: "bg-brand hover:bg-blue-500", removed: ["hover:bg-red-500"] });
  });
});

describe("tailwind: conflicts already in a class list", () => {
  const found = (classes: string, breakpoint: string | null = null) => model.analyze(classes, breakpoint, []).conflicts;

  it("finds two classes that set the same property at the same variants, the stylesheet's later one winning", () => {
    expect(found("flex gap-4 gap-3")).toEqual([{ winner: "gap-4", loser: "gap-3", properties: expect.arrayContaining(["row-gap", "column-gap"]) }]);
    expect(found("p-2 p-8")).toMatchObject([{ loser: "p-2", winner: "p-8" }]);
    // the order in the attribute does not decide which applies
    expect(found("text-blue-500 text-red-500").map((c) => c.loser)).toEqual(found("text-red-500 text-blue-500").map((c) => c.loser));
  });

  it("leaves narrower-next-to-broader, different variants, shared-variable readers and unknown classes alone", () => {
    expect(found("p-4 px-2")).toEqual([]);
    expect(found("p-4 md:p-8 hover:p-2")).toEqual([]);
    expect(found("text-sm leading-6 shadow-md ring-2")).toEqual([]);
    expect(found("box box2 p-4")).toEqual([]);
    expect(found("md:p-4 md:p-8")).toMatchObject([{ loser: "md:p-4", winner: "md:p-8" }]);
  });
});

describe("tailwind: where a new class goes", () => {
  it("appends when the repo's formatter does not sort classes", () => {
    const r = model.plan({ classes: "text-sm flex", utility: "p-4", breakpoint: null, states: [] });
    expect(r).toMatchObject({ ok: true, classes: "text-sm flex p-4" });
  });

  it("uses Tailwind's own order when the formatter is prettier-plugin-tailwindcss; classes it does not know stay first", () => {
    const r = sorted.plan({ classes: "text-sm flex box", utility: "p-4", breakpoint: null, states: [] });
    expect(r).toMatchObject({ ok: true, classes: "box flex p-4 text-sm" });
    const bp = sorted.plan({ classes: "flex", utility: "p-4", breakpoint: "md", states: [] });
    expect(bp).toMatchObject({ ok: true, classes: "flex md:p-4" });
  });

  it("detects the plugin in the project's prettier config", () => {
    const root = mkdtempSync(join(tmpdir(), "gable-prettier-"));
    expect(formatterSortsClasses(root)).toBe(false);
    writeFileSync(join(root, ".prettierrc"), JSON.stringify({ plugins: ["prettier-plugin-tailwindcss"] }));
    expect(formatterSortsClasses(root)).toBe(true);
  });
});

describe("tailwind: breakpoints are mobile-first", () => {
  const classes = "p-2 md:p-6 hover:bg-red-500 text-sm lg:text-lg";

  it("shows a value inherited from a smaller breakpoint, and an override at this one", () => {
    const base = model.analyze(classes, null, []);
    expect(base.values.padding).toMatchObject({ token: "p-2", at: "base", inherited: false });
    const md = model.analyze(classes, "md", []);
    expect(md.values.padding).toMatchObject({ token: "md:p-6", at: "md", inherited: false, label: "6", detail: "1.5rem" });
    const lg = model.analyze(classes, "lg", []);
    expect(lg.values.padding).toMatchObject({ token: "md:p-6", at: "md", inherited: true });
    expect(lg.values["font-size"]).toMatchObject({ token: "lg:text-lg", inherited: false });
    expect(md.values["font-size"]).toMatchObject({ token: "text-sm", at: "base", inherited: true });
  });

  it("does not show a value that only applies at a larger breakpoint", () => {
    expect(model.analyze("lg:p-4", "md", []).values.padding).toBeNull();
  });

  it("reads the state being edited, falling back to the plain state", () => {
    const hover = model.analyze(classes, "md", ["hover"]);
    expect(hover.values["background-color"]).toMatchObject({ token: "hover:bg-red-500", fromBaseState: false });
    expect(hover.values.padding).toMatchObject({ token: "md:p-6", fromBaseState: true });
    expect(model.analyze(classes, "md", []).values["background-color"]).toBeNull();
  });

  it("marks classes the design system does not know as unknown (never edited)", () => {
    const t = model.analyze("box p-4", null, []).tokens;
    expect(t.find((x) => x.token === "box")?.known).toBe(false);
  });
});

describe("tailwind: variants, search and forced states", () => {
  it("splits variants at top-level colons only", () => {
    expect(splitToken("md:hover:p-4")).toEqual({ variants: ["md", "hover"], utility: "p-4" });
    expect(splitToken("[&:hover]:p-4")).toEqual({ variants: ["[&:hover]"], utility: "p-4" });
    expect(splitToken("bg-[url(http://x)]")).toEqual({ variants: [], utility: "bg-[url(http://x)]" });
  });

  it("searches the class list, with the context's variants carried over, and accepts arbitrary values", () => {
    const hits = model.search("bg-bra", "md:");
    expect(hits[0]).toMatchObject({ token: "md:bg-brand" });
    expect(hits[0]!.css).toContain("background-color: #ff0066");
    expect(model.search("w-[137px]", "")[0]).toMatchObject({ token: "w-[137px]", css: "width: 137px" });
    expect(model.search("zzzzqq", "")).toEqual([]);
  });

  it("rewrites a state variant's rules for the injected forced-state rule", () => {
    const css = model.forceCss("p-4 hover:bg-brand md:hover:p-8 focus:ring-2", ["hover"]);
    expect(css).toContain(".hover\\:bg-brand[data-gd-forced]");
    expect(css).not.toMatch(/(?<!\\):hover/); // no pseudo-class left (the escaped class names still read `\:hover\:`)
    expect(css).not.toContain("hover: hover"); // the media condition is unwrapped
    expect(css).toContain("@media (width >= 800px)"); // the breakpoint is not
    expect(css).not.toContain("focus");
    // the escaped class name holds `:hover` too and must survive
    expect(model.forceCss("xl:hover:bg-brand", ["hover"])).toContain(String.raw`.xl\:hover\:bg-brand[data-gd-forced]`);
    const dark = model.forceCss("dark:bg-red-500", ["dark"]);
    expect(dark).toContain("[data-gd-forced]");
    expect(dark).not.toContain("prefers-color-scheme");
  });

  it("emits the real CSS (with @property defaults) for a hover preview of a class", () => {
    expect(model.css(["shadow-md", "w-[137px]"])).toContain("@property --tw-shadow");
    expect(model.css(["w-[137px]"])).toContain("width: 137px");
    expect(forceRules([], ["hover"])).toEqual([]);
  });
});
