// Shared driver helpers: launch Playwright's already-installed Chromium and read the WebGL renderer string.
import { chromium } from "playwright";

/** GPU modes: "swiftshader" (software GL, the headless default), "angle-d3d11" (try the real GPU), "angle-d3d11-headed". */
export const GPU_MODES = {
  default: { headless: true, args: [] },
  swiftshader: { headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  d3d11: { headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"] },
  "d3d11-new-headless": { headless: true, channel: "chromium", args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-sandbox"] },
  "d3d11-headed": { headless: false, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] },
};

// The installed browsers are revision 1243; the npm playwright wants a newer revision, so point at the binaries directly.
const PW = `${process.env.LOCALAPPDATA}/ms-playwright`;
const SHELL = `${PW}/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe`;
const FULL = `${PW}/chromium-1243/chrome-win64/chrome.exe`;

export async function launch(mode = "default", extraArgs = []) {
  const m = GPU_MODES[mode];
  if (!m) throw new Error(`unknown gpu mode ${mode}`);
  // headless shell for old-style headless; the full chrome.exe for new headless (--headless=new) and headed
  const executablePath = m.channel === "chromium" || !m.headless ? FULL : SHELL;
  return chromium.launch({ headless: m.headless, executablePath, args: [...m.args, ...extraArgs] });
}

export const UNCAPPED = ["--disable-frame-rate-limit", "--disable-gpu-vsync"];

/** The WebGL renderer string chromium reports (real GPU names the card, SwiftShader names itself). */
export async function glRenderer(page) {
  return page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return "no webgl";
    const e = gl.getExtension("WEBGL_debug_renderer_info");
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
}
