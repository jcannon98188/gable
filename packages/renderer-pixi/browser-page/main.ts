// Page bundled by browser.test.ts: a <gable-canvas> with a red rectangle, reporting what a real browser rendered.
import { bootstrap, html } from "@gable/core";
import { createDomRenderer } from "@gable/renderer-dom";
import { Application, Rectangle } from "pixi.js";
import { GableCanvas } from "../src/host.js";

let created = 0;
let app: Application | undefined;
const options = {
  background: 0x000000,
  resolution: 1,
  createApplication: () => {
    created++;
    return (app = new Application()) as never;
  },
};

class Page {
  static meta = {
    selector: "app-page",
    imports: [GableCanvas],
    template: html`<gable-canvas aria-label="Demo" [options]="options"><graphics><rect width="40" height="40" fill="#ff0000"></rect></graphics></gable-canvas>`,
  };
  options = options;
}

const target = document.getElementById("app")!;
bootstrap(Page, { renderer: createDomRenderer(), target });

const report = async () => {
  const host = target.querySelector("gable-canvas")!;
  const pixel = app ? Array.from(app.renderer.extract.pixels({ target: app.stage, frame: new Rectangle(10, 10, 1, 1) }).pixels) : [];
  document.body.setAttribute(
    "data-report",
    JSON.stringify({
      role: host.getAttribute("role"),
      label: host.getAttribute("aria-label"),
      canvases: host.querySelectorAll("canvas").length,
      apps: created,
      pixel,
      placeholderGone: host.querySelector(".gable-canvas-placeholder") === null,
    }),
  );
};
// Give the lazy load, Application init and a few frames time to run.
setTimeout(() => void report().catch((e) => document.body.setAttribute("data-report", JSON.stringify({ error: String(e) }))), 3000);
