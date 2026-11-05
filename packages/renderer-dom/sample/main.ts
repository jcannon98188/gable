import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { App } from "./app.js";

bootstrap(App, { renderer: dom(), target: "#app" });

// Drives the running page like a user would, then records what a real browser did, for the headless smoke test to read.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const $ = (selector: string) => document.querySelector(selector) as HTMLElement | null;

async function drive(): Promise<Record<string, unknown>> {
  await wait(100);
  const report: Record<string, unknown> = {};
  report.greeting = $(".greeting")!.textContent;
  report.badges = [...document.querySelectorAll(".chip")].map((e) => e.textContent);
  report.badgeColor = getComputedStyle($(".chip")!).color;
  report.svgNamespace = $(".dot") instanceof SVGCircleElement;
  report.viewportLoaded = $(".lazy-view") !== null;
  $(".inc")!.click();
  const input = $(".name") as HTMLInputElement;
  input.value = "browser";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  $(".open")!.click();
  await wait(100);
  report.count = $(".count")!.textContent;
  report.greetingAfterInput = $(".greeting")!.textContent;
  report.interactionLoaded = $(".lazy-click") !== null;
  return report;
}

drive().then(
  (report) => (document.body.dataset.report = JSON.stringify(report)),
  (error) => (document.body.dataset.report = JSON.stringify({ error: String(error) })),
);
