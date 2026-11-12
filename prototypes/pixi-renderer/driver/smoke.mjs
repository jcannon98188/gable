// Loads a URL, prints console output and page errors, optionally a screenshot. Usage: node driver/smoke.mjs <url> [shot.png] [gpuMode]
import { glRenderer, launch } from "./common.mjs";

const [url, shot, mode = "d3d11"] = process.argv.slice(2);
const browser = await launch(mode);
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
page.on("console", (m) => console.log(`[console.${m.type()}]`, m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(url);
await page.waitForTimeout(3000);
console.log("gl:", await glRenderer(page));
console.log(
  await page.evaluate(() => ({
    result: globalThis.__result ?? null,
    demo: globalThis.__demo ? { hooks: globalThis.__demo.frame.count, rocks: globalThis.__demo.state.rocks().length } : null,
    canvases: document.querySelectorAll("canvas").length,
  })),
);
if (shot) await page.screenshot({ path: shot });
await browser.close();
