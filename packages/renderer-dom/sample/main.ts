import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { App } from "./app.js";

bootstrap(App, { renderer: dom(), target: "#app" });

// Drives the running page like a user would, then records what a real browser did, for the headless smoke test to read.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Polls instead of sleeping a fixed time: IntersectionObserver and deferred loads arrive when the browser gets to them,
// which under load is later than any fixed delay. Virtual time makes waiting here cheap; the budget is the test's 3000ms.
// Each round waits for a rendered frame: under virtual time a bare timer runs without one, and IntersectionObserver
// (which the viewport defer uses) only reports after a frame, so timers alone can burn the whole limit before it fires.
const frame = () => new Promise<void>((r) => { const t = setTimeout(r, 50); requestAnimationFrame(() => { clearTimeout(t); r(); }); });
async function until(condition: () => boolean, rounds = 100): Promise<void> {
  for (let i = 0; i < rounds && !condition(); i++) await frame();
}
const $ = (selector: string) => document.querySelector(selector) as HTMLElement | null;

async function drive(): Promise<Record<string, unknown>> {
  await until(() => $(".lazy-view") !== null);
  const report: Record<string, unknown> = {};
  report.greeting = $(".greeting")!.textContent;
  report.badges = [...document.querySelectorAll(".chip")].map((e) => e.textContent);
  report.badgeColor = getComputedStyle($(".chip")!).color;
  report.svgNamespace = $(".dot") instanceof SVGCircleElement;
  $(".inc")!.click();
  const input = $(".name") as HTMLInputElement;
  input.value = "browser";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  $(".open")!.click();
  await until(() => $(".lazy-click") !== null);
  report.count = $(".count")!.textContent;
  report.greetingAfterInput = $(".greeting")!.textContent;
  await until(() => $(".lazy-view") !== null);
  report.viewportLoaded = $(".lazy-view") !== null;
  report.interactionLoaded = $(".lazy-click") !== null;
  return report;
}

drive().then(
  (report) => (document.body.dataset.report = JSON.stringify(report)),
  (error) => (document.body.dataset.report = JSON.stringify({ error: String(error) })),
);
