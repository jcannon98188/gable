// Driven check of the Designer's chrome: the command palette, focus rings, remembered panels, and the flows with no backend yet.
// Start the Designer's backend on examples/ui-gallery and a Chromium with a remote debugging port (see device-check.mjs), then:
//
//   node e2e/chrome-check.mjs --port 9444 --shell 127.0.0.1:5190
import { connect } from "./cdp.mjs";

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const port = Number(arg("--port", "9444"));
const shellPart = arg("--shell", "127.0.0.1:5190");
let failed = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

const page = await connect(port, shellPart);
const { ev, sleep, until, cdp } = page;
const key = async (k, code, vk, modifiers = 0) => {
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const palette = async (query) => {
  await key("k", "KeyK", 75, 2);
  await until(() => ev(`!!document.querySelector('[role="dialog"] input')`), "the palette opens");
  await sleep(150);
  await cdp("Input.insertText", { text: query });
  await sleep(250);
  await key("Enter", "Enter", 13);
  await sleep(500);
};
const selected = (name) => ev(`[...document.querySelectorAll('[data-part="trigger"][data-selected]')].some((t) => t.textContent.trim() === ${JSON.stringify(name)})`);

await until(() => ev(`document.body.innerText.includes("Connected")`), "the shell is connected", 60000);
await sleep(1000);

// --- the palette ----------------------------------------------------------------------------------------------------
await palette("Show Inspector");
check(await selected("Inspector"), "the palette runs a command: Show Inspector");
await palette("Show Style");
check(await selected("Style"), "the palette runs a command: Show Style");
const r = await ev(`(() => { const b = document.querySelector("app-frame-view iframe").getBoundingClientRect(); return { x: b.x + b.width * 0.5, y: b.y + Math.min(b.height * 0.35, 220) }; })()`);
await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
await sleep(80);
for (const type of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 });
await until(() => ev(`!!document.querySelector("[data-control]")`), "an element is selected");
await palette("Style: Display");
check(await ev(`!!document.querySelector('[data-picker="display"]')`), "a Style control is reachable from the palette");
await ev(`document.querySelector('[data-control="display"]').click()`);
await palette("Edit the text");
check(await selected("Content"), "a Content control is reachable from the palette");
await palette("Problems: show errors");
check(await ev(`document.querySelector('[data-problems-filter="error"]')?.getAttribute("aria-pressed") === "true"`), "the palette reaches a drawer filter");
await palette("Problems: show all");
const frameCount = () => ev(`document.querySelectorAll("app-frame-view").length`);
const framesBefore = await frameCount();
await palette("Duplicate the selected frame");
check((await frameCount()) === framesBefore + 1, "the palette duplicates the selected frame");
await palette("Close the selected frame");
await palette("Show Style");

// --- focus rings ----------------------------------------------------------------------------------------------------
await ev(`document.activeElement?.blur?.()`);
const stops = [];
for (let i = 0; i < 45; i++) {
  await key("Tab", "Tab", 9);
  await sleep(40);
  const seen = await ev(`(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    if (el.tagName === "IFRAME") return { name: "iframe", ring: true };
    const has = (s) => (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
    const holder = el.closest(".fld, .chip");
    const ring = has(getComputedStyle(el)) || (holder && has(getComputedStyle(holder)));
    return { name: (el.getAttribute("aria-label") || el.textContent.trim() || el.tagName).slice(0, 24), ring: !!ring };
  })()`);
  if (seen) stops.push(seen);
}
const bare = stops.filter((s) => !s.ring).map((s) => s.name);
check(stops.length >= 20 && bare.length === 0, "every stop on the way through the shell shows a focus ring", `${stops.length} stops${bare.length ? ", without: " + bare.join(" | ") : ""}`);

// --- panel sizes, the drawer and the theme are remembered -------------------------------------------------------------
const leftWidth = () => ev(`Math.round(document.querySelector(".side").getBoundingClientRect().width)`);
const before = await leftWidth();
await ev(`document.querySelector('[role="separator"]').focus()`);
for (let i = 0; i < 4; i++) await key("ArrowRight", "ArrowRight", 39);
await sleep(200);
const resized = await leftWidth();
check(resized > before, "the keyboard resizes a panel", `${before} → ${resized}`);
await palette("Show Problems in the drawer");
await palette("Use the dark theme");
await sleep(1000);
await cdp("Page.reload");
await sleep(1500);
await until(() => ev(`document.body.innerText.includes("Connected")`), "connected after the reload", 60000);
await sleep(800);
const after = await leftWidth();
check(Math.abs(after - resized) <= 2, "panel sizes are remembered across a reload", `${resized} → ${after}`);
check(await ev(`[...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some((t) => t.textContent.trim().startsWith("Problems"))`), "the drawer's open tab is remembered");
check(await ev(`document.documentElement.classList.contains("dark")`), "the theme is remembered");
await palette("Use the light theme");
await sleep(600);

// --- flows without a backend say so, and do nothing ---------------------------------------------------------------------
for (const [command, words, button] of [
  ["Open a project", "not available yet", "Browse…"],
  ["Extract to component", "not available yet", "Extract"],
  ["New Scenario", "cannot write Scenarios yet", "Create"],
]) {
  await palette(command);
  const body = await ev(`[...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText).join(" ")`);
  const off = await ev(`[...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === ${JSON.stringify(button)})?.disabled === true`);
  check(body.includes(words) && off, `${command} says it is unavailable and its action is disabled`, body.slice(0, 120).replace(/\s+/g, " "));
  await key("Escape", "Escape", 27);
  await sleep(300);
}
await palette("Show Accessibility in the drawer");
check((await ev("document.body.innerText")).includes("not available"), "Accessibility says it has no checks yet rather than reporting zero issues");

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
page.close();
process.exit(failed ? 1 : 0);
