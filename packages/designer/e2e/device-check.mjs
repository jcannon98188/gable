// Driven check of device emulation and the multi-frame canvas. Start the Designer's backend on a project and a Chromium
// (headless Edge, or the Tauri/WebView2 window started with GABLE_CDP_PORT) with a remote debugging port, then:
//
//   node e2e/device-check.mjs --port 9444 --shell 127.0.0.1:5190 [--no-cdp] [--shot dir]
//
// The backend needs --cdp-port with the same port (the desktop app passes it itself on Windows). `--no-cdp` is for a backend
// started WITHOUT it, which is the situation on macOS and Linux: it checks the fallbacks and the "unsupported" labels.
// This script only reads what the frames report about themselves (innerWidth, matchMedia, ...), so it proves the emulation
// really reached each iframe, not just that the shell asked for it.
import { mkdirSync, writeFileSync } from "node:fs";
import { connect, connectBrowser } from "./cdp.mjs";

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const port = Number(arg("--port", "9444"));
const shellPart = arg("--shell", "127.0.0.1:5190");
const noCdp = process.argv.includes("--no-cdp");
const shotDir = arg("--shot", "");
let failed = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

const page = await connect(port, shellPart);
const browser = await connectBrowser(port);
const { ev, sleep, until, cdp } = page;
const shot = async (name) => {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  writeFileSync(`${shotDir}/${name}.png`, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
};

// --- helpers that act on the shell page like a user would ---------------------------------------------------------
const shell = {
  boxes: () =>
    ev(`JSON.stringify([...document.querySelectorAll("app-frame-view iframe")].map(f => ({ w: f.style.width, h: f.style.height, t: f.style.transform, r: f.getBoundingClientRect().toJSON() })))`).then(JSON.parse),
  click: (text) => ev(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(text)})?.click() ?? "no button"`),
  select: (label, value) =>
    ev(`(() => { const s = document.querySelector('select[aria-label="${label}"]'); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`),
  // The color scheme select has no aria-label: it sits in a label with its text.
  labelled: (text, value) =>
    ev(`(() => { const l = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith(${JSON.stringify(text)})); const s = l.querySelector("select"); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`),
  field: (label, value) =>
    ev(`(() => { const s = document.querySelector('input[aria-label="${label}"]'); s.value = ${JSON.stringify(String(value))}; s.dispatchEvent(new Event("change", { bubbles: true })); s.dispatchEvent(new Event("input", { bubbles: true })); })()`),
  checkbox: (labelText, on) =>
    ev(`(() => { const l = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith(${JSON.stringify(labelText)})); const c = l.querySelector("input[type=checkbox]"); if (c.checked !== ${on}) c.click(); })()`),
  text: () => ev("document.body.innerText"),
};
const frameCount = async () => (await shell.boxes()).length;
// The preview frames are told apart by their width (every frame in this check has a distinct size).
const frameBy = async (width) => {
  for (const f of await browser.frames()) if ((await f.ev("innerWidth").catch(() => 0)) === width) return f;
  return null;
};
const media = (f) =>
  f
    .ev(
      `JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent, points: navigator.maxTouchPoints, touchProp: "ontouchstart" in window,
  coarse: matchMedia("(pointer: coarse)").matches, hoverNone: matchMedia("(hover: none)").matches, dark: matchMedia("(prefers-color-scheme: dark)").matches, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches })`,
    )
    .then(JSON.parse);
const tokenOf = () => ev("__GABLE_DESIGNER__.token");
const api = async (path, body) => {
  const res = await fetch(`http://${shellPart}${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${await tokenOf()}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};
const liveFrames = async (n) => until(async () => (await shell.text()).split("live").length - 1 >= n, `${n} live frame(s)`);

await liveFrames(1);
await sleep(800);

// --- AC1: size, DPR, fit scaling, rotation, presets, custom sizes -----------------------------------------------------
let boxes = await shell.boxes();
check(boxes.length === 1, "one frame to start with");
check(boxes[0].w === "1280px" && boxes[0].h === "800px", "default frame is the Laptop preset size", `${boxes[0].w} x ${boxes[0].h}`);
const scale0 = Number(/scale\(([\d.]+)\)/.exec(boxes[0].t)?.[1]);
check(scale0 < 1 && Math.abs(boxes[0].r.width - 1280 * scale0) < 2, "fit-to-screen scales the frame to the board", `scale ${scale0}`);
const first = await frameBy(1280);
check(!!first, "the iframe's own viewport is 1280 wide (its target was found)");

await shell.select("Device", "iphone-15");
await until(async () => (await shell.boxes())[0]?.w === "393px", "iPhone 15 size");
boxes = await shell.boxes();
check(boxes[0].w === "393px" && boxes[0].h === "852px", "a preset sets width and height", `${boxes[0].w} x ${boxes[0].h}`);
await sleep(600);
const phone = await frameBy(393);
const pm = phone ? await media(phone) : null;
check(pm?.w === 393 && pm?.h === 852, "the iframe's viewport follows (393x852)", JSON.stringify([pm?.w, pm?.h]));
check(pm?.dpr === 3, "the preset sets the pixel ratio scripts read (3)", String(pm?.dpr));
check(/iPhone/.test(pm?.ua ?? "") === !noCdp, noCdp ? "without CDP the user agent is left alone" : "the preset applies the iPhone user agent over CDP", (pm?.ua ?? "").slice(0, 50));

await shell.click("Portrait");
await until(async () => (await shell.boxes())[0]?.w === "852px", "rotation");
boxes = await shell.boxes();
check(boxes[0].w === "852px" && boxes[0].h === "393px", "rotation swaps width and height");
await shell.click("Landscape");
await until(async () => (await shell.boxes())[0]?.w === "393px", "rotation back");

await shell.field("Width", 500);
await shell.field("Height", 700);
await shell.field("DPR", 2);
await until(async () => (await shell.boxes())[0]?.w === "500px", "custom size");
await sleep(600);
const custom = await frameBy(500);
const cm = custom ? await media(custom) : null;
check(cm?.w === 500 && cm?.h === 700 && cm?.dpr === 2, "custom width, height and DPR", JSON.stringify([cm?.w, cm?.h, cm?.dpr]));
check(/Custom/.test(await ev(`document.querySelector('select[aria-label="Device"]').selectedOptions[0].textContent`)), "editing a preset's size makes the frame custom");
await shell.select("Device", "iphone-15");
await until(async () => (await shell.boxes())[0]?.w === "393px", "back to iPhone 15");

// --- AC2: several frames, each its own instance -----------------------------------------------------------------------
await shell.click("Add frame");
await until(async () => (await frameCount()) === 2, "a second frame");
await shell.select("Device", "laptop"); // the new frame is selected: make it the laptop, the first stays the phone
await until(async () => (await shell.boxes()).some((b) => b.w === "1280px"), "second frame size");
await liveFrames(2);
await sleep(1000);
boxes = await shell.boxes();
check(boxes.length === 2 && boxes[0].w === "393px" && boxes[1].w === "1280px", "two frames with different sizes");
check(boxes[0].r.right <= boxes[1].r.left + 1, "they sit side by side");
const targets = await browser.frames();
const nonces = [];
for (const t of targets) nonces.push((await t.ev("window.name"))?.split(":")[1]?.split("|")[0]);
check(targets.length === 2 && new Set(nonces).size === 2, "each frame is its own app instance with its own session nonce", nonces.map((n) => n?.slice(0, 8)).join(" "));
await shot("two-frames");

// --- AC3 (CDP) / AC4 (no CDP): emulation ------------------------------------------------------------------------------
await shell.click("Interact");
await sleep(300);
await shell.click("iPhone 15"); // the device bar edits the selected frame: select the phone (the laptop was added last)
await sleep(200);
const base = await media(await frameBy(393));
if (!noCdp) {
  check(base.coarse && base.hoverNone && base.points === 5, "touch: pointer is coarse, hover is none, 5 touch points (over CDP)", JSON.stringify([base.coarse, base.hoverNone, base.points]));
  check(/iPhone/.test(base.ua), "user agent override");
  const desktop = await media(await frameBy(1280));
  check(!desktop.coarse && !desktop.hoverNone && !/iPhone/.test(desktop.ua), "emulation is per frame: the laptop frame is untouched");
  // The browser's own scheme may be either (headless Edge is dark): force the opposite on the phone only.
  const baseDark = (await media(await frameBy(1280))).dark;
  const forced = baseDark ? "light" : "dark";
  await shell.labelled("Color scheme", forced);
  await shell.checkbox("Reduced motion", true);
  await until(async () => (await media(await frameBy(393))).reduced, "reduced motion");
  const m = await media(await frameBy(393));
  check(m.dark === !baseDark && m.reduced, `color scheme ${forced} and reduced motion over CDP`, JSON.stringify([m.dark, m.reduced]));
  const other = await media(await frameBy(1280));
  check(other.dark === baseDark && !other.reduced, "the other frame keeps its own color scheme and motion", JSON.stringify([other.dark, other.reduced]));
  await shell.labelled("Color scheme", "auto");
  await shell.checkbox("Reduced motion", false);
  await until(async () => !(await media(await frameBy(393))).reduced, "reduced motion off");
  const m2 = await media(await frameBy(393));
  check(m2.dark === baseDark && !m2.reduced, "auto and off restore the browser's own values", JSON.stringify([m2.dark, m2.reduced]));
  check(!(await shell.text()).includes("unsupported"), "with CDP nothing is labelled unsupported");
} else {
  check(!base.coarse && !base.hoverNone, "no CDP: media features are the real device's", JSON.stringify([base.coarse, base.hoverNone]));
  const text = await shell.text();
  const labels = (text.match(/unsupported/g) ?? []).length;
  check(labels >= 3, "unsupported emulation is labelled in the UI (color scheme, reduced motion, user agent)", `${labels} labels`);
}

// Touch events from the mouse (the agent does this everywhere; with CDP the media features come on top).
await shell.checkbox("Touch", true);
await sleep(1000);
if (noCdp) check((await shell.text()).includes("touch events only"), "without CDP touch is labelled as events only");
const pf = await frameBy(393);
await pf.ev(`window.__log = []; for (const t of ["touchstart","touchmove","touchend","mousedown"]) addEventListener(t, (e) => __log.push(t + ":" + e.isTrusted), true); null`);
const rect = (await shell.boxes())[0].r;
const el = JSON.parse(await pf.ev(`JSON.stringify(document.querySelector(".new-todo").getBoundingClientRect())`));
const s = rect.width / 393;
const px = rect.left + (el.left + el.width / 2) * s;
const py = rect.top + (el.top + el.height / 2) * s;
for (const type of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type, x: px, y: py, button: "left", clickCount: 1 });
await sleep(300);
const log = JSON.parse(await pf.ev("JSON.stringify(__log)"));
check(log.includes("touchstart:false") && log.includes("touchend:false") && log.includes("mousedown:true"), "a mouse press also becomes touchstart/touchend (synthetic, from the agent)", log.join(","));
check((await media(pf)).touchProp, "'ontouchstart' in window is true with touch on");

// --- AC2: sync -------------------------------------------------------------------------------------------------------
await shell.checkbox("Sync", true);
await sleep(300);
const fa = await frameBy(393);
const fb = await frameBy(1280);
for (const type of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type, x: px, y: py, button: "left", clickCount: 1 });
await cdp("Input.insertText", { text: "buy milk" });
await sleep(500);
const typedA = await fa.ev(`document.querySelector(".new-todo").value`);
const typedB = await fb.ev(`document.querySelector(".new-todo").value`);
check(typedA === "buy milk", "typing reached the first frame", typedA);
check(typedB === "buy milk", "with Sync on, typing is repeated in the other frame", typedB);
await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await sleep(600);
const countA = await fa.ev(`document.querySelectorAll(".todo-list li").length`);
const countB = await fb.ev(`document.querySelectorAll(".todo-list li").length`);
check(countA === 1 && countB === 1, "Enter adds the todo in both frames", `${countA}, ${countB}`);
await shot("synced");
await shell.checkbox("Sync", false);
await sleep(200);
await cdp("Input.insertText", { text: "alone" });
await sleep(400);
check((await fb.ev(`document.querySelector(".new-todo").value`)) === "", "with Sync off the other frame is left alone");

// --- the selected frame, for Tailwind mode ----------------------------------------------------------------------------
const bar = await shell.text();
check(/\d+px · (base|sm|md|lg|xl|2xl)/.test(bar), "the bar shows the selected frame's width and breakpoint", /\d+px · \w+/.exec(bar)?.[0]);

// --- AC1: presets saved per project and layout restored -----------------------------------------------------------------
await shell.field("Preset name", "My phone");
await shell.click("Save preset");
await sleep(900);
const settings = await api("/api/devices/settings");
check(settings.presets.some((p) => p.name === "My phone") && settings.frames.length === 2, "presets and the frame layout are saved by the backend", JSON.stringify({ presets: settings.presets.map((p) => p.name), frames: settings.frames.length }));
await cdp("Page.reload");
await sleep(1500);
await until(async () => (await frameCount()) === 2, "frames restored after reload");
const options = await ev(`[...document.querySelectorAll('select[aria-label="Device"] option')].map(o => o.textContent).join("|")`);
check(options.includes("My phone"), "the saved preset is offered after a reload");
await liveFrames(2);
await shot("restored");

// --- AC5: escape hatch (the real browser launch is checked by hand; here, that it is not a general URL opener) ------------
const bad = await fetch(`http://${shellPart}/api/devices/open-external`, {
  method: "POST",
  headers: { authorization: `Bearer ${await tokenOf()}`, "content-type": "application/json" },
  body: JSON.stringify({ path: "http://evil.example/" }),
});
check(bad.status === 400, "open-external refuses a URL that is not the project's dev server", String(bad.status));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
page.close();
browser.close();
process.exit(failed ? 1 : 0);
