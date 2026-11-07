// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { Playground } from "./playground.js";
import { STARTER, SUGGESTIONS } from "./samples.js";

/** Mounts the playground on the real DOM renderer (it needs real elements to render a template into). */
async function open() {
  const root = document.createElement("div");
  document.body.append(root);
  const app = bootstrap(Playground, { renderer: dom(), target: root });
  const el = root;
  const settle = async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  };
  await settle();
  const out = () => el.querySelector(".pg-out")!;
  const status = () => el.querySelector(".pg-status")!;
  const type = async (text: string) => {
    const ta = el.querySelector("textarea")!;
    ta.value = text;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
  };
  const chip = (label: string) => [...el.querySelectorAll<HTMLButtonElement>("button.pg-chip")].find((b) => b.textContent === label)!;
  return { app, el, out, status, type, chip, settle };
}

describe("Playground", () => {
  it("renders the starter template from its source text at runtime", async () => {
    const p = await open();
    expect(p.out().textContent).toContain("Hello, Ada!");
    expect(p.out().querySelectorAll("li")).toHaveLength(3);
    expect(p.status().textContent).toContain("Rendered by the real parser");
  });

  it("re-renders live as the text changes, and the rendered component is interactive", async () => {
    const p = await open();
    await p.type("<h3>Count: {{ count() }}</h3><button (click)=\"inc()\">Plus</button>");
    expect(p.out().textContent).toContain("Count: 0");
    p.out().querySelector("button")!.click();
    await p.settle();
    expect(p.out().textContent).toContain("Count: 1");
  });

  it("keeps the last good render and shows the real parser message for a bad template", async () => {
    const p = await open();
    await p.type("<p>good render</p>");
    await p.type("<p>{{ show() ? 'a' : 'b' }}</p>");
    expect(p.out().textContent).toContain("good render");
    expect(p.status().textContent).toContain("the conditional operator is not allowed");
    expect(p.el.querySelector("textarea")!.getAttribute("aria-invalid")).toBe("true");
    await p.type("<p>fixed</p>");
    expect(p.out().textContent).toBe("fixed");
    expect(p.status().textContent).toContain("Rendered by the real parser");
  });

  it("reports an unclosed tag and a missing field with the runtime's own messages", async () => {
    const p = await open();
    await p.type("<div><span>hi</div>");
    expect(p.status().textContent).toMatch(/Unexpected <\/div>|Unclosed <span>/);
    await p.type("<p>{{ nope() }}</p>");
    expect(p.status().classList.contains("bad")).toBe(true);
  });

  it("applies every suggested edit: working ones render, error ones raise a real error", async () => {
    const p = await open();
    for (const s of SUGGESTIONS) {
      p.chip(s.label).click();
      await p.settle();
      const bad = p.status().classList.contains("bad");
      expect(bad, `${s.label}: ${p.status().textContent}`).toBe(s.kind === "error");
      if (s.kind === "error") expect(p.out().textContent, s.label).toContain("Hello, Ada!");
    }
  });

  it("Reset restores the starter template and clears the error", async () => {
    const p = await open();
    p.chip("Try a ternary").click();
    await p.settle();
    expect(p.status().classList.contains("bad")).toBe(true);
    p.chip("Reset").click();
    await p.settle();
    expect(p.el.querySelector("textarea")!.value).toBe(STARTER);
    expect(p.status().classList.contains("good")).toBe(true);
  });
});
