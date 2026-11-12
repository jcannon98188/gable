// Which GL does each launch mode get? Usage: node driver/gpu-check.mjs
import { GPU_MODES, glRenderer, launch } from "./common.mjs";

for (const mode of Object.keys(GPU_MODES)) {
  try {
    const browser = await launch(mode);
    const page = await browser.newPage();
    await page.goto("about:blank");
    console.log(mode.padEnd(20), "=>", await glRenderer(page), "|", browser.version());
    await browser.close();
  } catch (e) {
    console.log(mode.padEnd(20), "=> FAILED:", String(e.message).split("\n")[0]);
  }
}
