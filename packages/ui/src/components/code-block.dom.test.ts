// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiCodeBlock } from "./code-block.js";
import type { Highlighter } from "../lib/highlight.js";
import { $, $$, settle, useDomApp } from "../test-utils.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiCodeBlock],
    template: html`<ui-code-block label="Sample" [code]="code()" [language]="language()" [lineNumbers]="numbers()" [wrap]="wrap()" [highlightLines]="marked()" [highlighter]="custom()" [oldCode]="oldCode()" [newCode]="newCode()" [layout]="layout()" [context]="1" diffLanguage="ts" (copied)="copies.push($event)"></ui-code-block>`,
  };
  code = signal('const a = "x"; // hi\nlet b = 2;\n/* multi\nline */');
  language = signal("ts");
  numbers = signal(false);
  wrap = signal(false);
  marked = signal<string | number[]>("");
  custom = signal<Highlighter | null>(null);
  oldCode = signal<string | null>(null);
  newCode = signal<string | null>(null);
  layout = signal<"unified" | "split">("unified");
  copies: Array<{ text: string; ok: boolean }> = [];
}

const boot = useDomApp();
const lines = () => $$("code > span");
const spans = (line: Element) => [...line.querySelectorAll(":scope > span:last-child > span")].map((s) => [s.textContent, s.className] as const);
function clipboard(fail = false): { writes: string[] } {
  const writes: string[] = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t: string) => (writes.push(t), fail ? Promise.reject(new Error("no")) : Promise.resolve()) } });
  return { writes };
}

describe("ui-code-block", () => {
  it("renders pre/code with one row per line and coloured token spans", async () => {
    await boot(App);
    expect($("pre")).not.toBeNull();
    expect($("pre > code")).not.toBeNull();
    expect($("code").getAttribute("data-language")).toBe("ts");
    expect(lines()).toHaveLength(4);
    expect(lines().map((l) => l.textContent)).toEqual(['const a = "x"; // hi', "let b = 2;", "/* multi", "line */"]);
    const first = spans(lines()[0]!);
    expect(first.find(([t]) => t === "const")![1]).toContain("text-violet-700");
    expect(first.find(([t]) => t === '"x"')![1]).toContain("text-emerald-700");
    expect(first.find(([t]) => t === "// hi")![1]).toContain("italic");
    expect(spans(lines()[3]!)[0]).toEqual(["line */", expect.stringContaining("italic")]);
    expect($("[role=group]").getAttribute("aria-label")).toBe("Sample");
    await expectNoA11yViolations($("ui-code-block"));
  });

  it("shows line numbers, highlighted lines and wrap on request", async () => {
    const app = await boot(App);
    expect($$(".tabular-nums")).toHaveLength(0);
    app.numbers.set(true);
    app.marked.set("2,4");
    await settle();
    expect($$(".tabular-nums").map((n) => n.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(lines().map((l) => l.className.includes("bg-primary/10"))).toEqual([false, true, false, true]);
    expect(lines()[0]!.querySelector(".whitespace-pre")).not.toBeNull();
    app.wrap.set(true);
    app.marked.set([1]);
    await settle();
    expect(lines()[0]!.querySelector(".whitespace-pre-wrap")).not.toBeNull();
    expect(lines().map((l) => l.className.includes("bg-primary/10"))).toEqual([true, false, false, false]);
  });

  it("escapes markup in the code instead of rendering it", async () => {
    const app = await boot(App);
    app.language.set("html");
    app.code.set('<img src=x onerror="alert(1)"><script>window.hacked = 1</script>');
    await settle();
    expect($("code").querySelector("img")).toBeNull();
    expect($("code").querySelector("script")).toBeNull();
    expect($("code").textContent).toBe('<img src=x onerror="alert(1)"><script>window.hacked = 1</script>');
    expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
  });

  it("copies the code, announces it and reports failure", async () => {
    const app = await boot(App);
    const { writes } = clipboard();
    const button = $<HTMLButtonElement>("button");
    expect(button.getAttribute("aria-label")).toBe("Copy code");
    button.click();
    await settle();
    expect(writes).toEqual([app.code()]);
    expect($("[role=status]").textContent).toBe("Copied to clipboard");
    expect(button.getAttribute("aria-label")).toBe("Copied");
    expect(app.copies).toEqual([{ text: app.code(), ok: true }]);
    clipboard(true);
    button.click();
    await settle();
    expect($("[role=status]").textContent).toBe("Could not copy");
    expect(app.copies[1]!.ok).toBe(false);
  });

  it("uses a custom highlighter, and falls back when it throws", async () => {
    const app = await boot(App);
    app.custom.set((code) => code.split("\n").map((l) => [{ text: l, kind: "tag" as const }]));
    await settle();
    expect(spans(lines()[1]!)).toEqual([["let b = 2;", expect.stringContaining("text-rose-700")]]);
    app.custom.set(() => {
      throw new Error("boom");
    });
    await settle();
    expect(spans(lines()[1]!).some(([t, c]) => t === "let" && c.includes("violet"))).toBe(true);
  });

  it("renders unified diff text with markers, kinds and hunk line numbers", async () => {
    const app = await boot(App);
    app.language.set("diff");
    app.numbers.set(true);
    app.code.set("--- a/x.ts\n+++ b/x.ts\n@@ -3,3 +3,3 @@\n keep\n-const a = 1;\n+const a = 2;\n tail\n\\ No newline at end of file\n");
    await settle();
    const rows = lines();
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.className.match(/bg-emerald-500|bg-red-500|bg-sky-500|font-medium|italic/)?.[0] ?? "")).toEqual(["font-medium", "font-medium", "bg-sky-500", "", "bg-red-500", "bg-emerald-500", "", "italic"]);
    expect([...rows[4]!.children].map((c) => c.textContent)).toEqual(["4", "", "-", "const a = 1;"]);
    expect([...rows[5]!.children].map((c) => c.textContent)).toEqual(["", "4", "+", "const a = 2;"]);
    expect(rows[3]!.children[2]!.textContent).toBe(" ");
    const kw = [...rows[5]!.querySelectorAll("span span span")].find((s) => s.textContent === "const");
    expect(kw?.className).toContain("violet");
    await expectNoA11yViolations($("ui-code-block"));
  });

  it("computes a diff from oldCode and newCode, collapses unchanged lines, and escapes", async () => {
    const app = await boot(App);
    const old = Array.from({ length: 12 }, (_, i) => `line ${i}`);
    const next = old.slice();
    next[5] = "<b>changed</b>";
    app.oldCode.set(old.join("\n"));
    app.newCode.set(next.join("\n"));
    await settle();
    expect(lines().map((l) => l.textContent)).toEqual(["@@ -5,3 +5,3 @@", " line 4", "-line 5", "+<b>changed</b>", " line 6"]);
    expect($("code").querySelector("b")).toBeNull();
    const { writes } = clipboard();
    $<HTMLButtonElement>("button").click();
    await settle();
    expect(writes[0]).toBe("@@ -5,3 +5,3 @@\n line 4\n-line 5\n+<b>changed</b>\n line 6");
  });

  it("lays a diff out side by side", async () => {
    const app = await boot(App);
    app.oldCode.set("a\nb\nc");
    app.newCode.set("a\nB\nc\nd");
    app.layout.set("split");
    app.numbers.set(true);
    await settle();
    const rows = $$("code > span");
    expect(rows).toHaveLength(5);
    const cells = (r: Element) => [...r.children].map((c) => c.textContent);
    expect(cells(rows[1]!)).toEqual(["1 a", "1 a"]);
    expect(cells(rows[2]!)).toEqual(["2-b", "2+B"]);
    expect(cells(rows[4]!)).toEqual(["", "4+d"]);
    expect(rows[0]!.children[0]!.className).toContain("col-span-2");
    expect(rows[0]!.children[1]!.className).toBe("hidden");
    await expectNoA11yViolations($("ui-code-block"));
  });
});
