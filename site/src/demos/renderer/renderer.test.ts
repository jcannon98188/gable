// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { RendererDemo } from "./renderer-demo.js";

const wait = () => new Promise((r) => setTimeout(r, 30));

function open() {
  const root = document.createElement("div");
  document.body.append(root);
  const app = bootstrap(RendererDemo, { renderer: dom(), target: root });
  return { root, app };
}
const buttons = (root: Element) => [...root.querySelectorAll("button")];
const calls = (root: Element) => [...root.querySelectorAll("ol li")].map((li) => li.textContent);

describe("RendererDemo", () => {
  it("renders the component with the DOM renderer and shows only the writes a change causes", async () => {
    const { root } = open();
    await wait();
    expect(root.querySelector(".box")?.textContent).toContain("Clicked 0 times");
    buttons(root)[0]!.click();
    await wait();
    expect(root.querySelector(".box")?.textContent).toContain("Clicked 1 times");
    expect(calls(root)).toEqual(['setAttribute data-count = "1"', 'setText "Clicked 1 times"']);
    buttons(root)[1]!.click();
    await wait();
    expect(calls(root)).toEqual(["setClass on = true", 'setText "Highlight is on"']);
    expect(root.querySelector(".box.on")).toBeTruthy();
  });

  it("an equal write causes no renderer calls", async () => {
    const { root } = open();
    await wait();
    buttons(root)[2]!.click();
    await wait();
    expect(root.querySelectorAll("h4")[1]?.textContent).toBe("Renderer calls: 0");
  });
});
