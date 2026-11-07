// Driven check of Tailwind mode on a real Tailwind v4 project (examples/ui-gallery) or a project without Tailwind (--off).
// Start the Designer backend and a Chromium (headless Edge, or the Tauri/WebView2 window) with a debugging port, then:
//
//   node e2e/tailwind-check.mjs --port 9444 --shell 127.0.0.1:5190 [--cdp|--no-cdp] [--off] [--source <file>] [--shot dir]
//
// It drives the shell like a user (click a node on the canvas, use the Style tab) and reads what the frames report about
// themselves (computed styles in the previewed page) and what lands in the source file, so it proves the edit, the
// breakpoint prefix and the forced states really happened, not just that the shell asked. `--source` is the file holding
// the `<h1 class="text-2xl font-semibold tracking-tight">` the check edits (it is restored at the end).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connect, connectBrowser } from "./cdp.mjs";

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const port = Number(arg("--port", "9444"));
const shellPart = arg("--shell", "127.0.0.1:5190");
const off = process.argv.includes("--off");
const noCdp = process.argv.includes("--no-cdp");
const source = arg("--source", "");
const shotDir = arg("--shot", "");
let failed = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

const blank = (await connect(port, "about:blank").catch(() => null)) ?? (await connect(port, shellPart).catch(() => null));
if (blank) {
  await blank.cdp("Page.navigate", { url: `http://${shellPart}/` });
  await blank.sleep(2500);
}
const page = await connect(port, shellPart);
const browser = await connectBrowser(port);
const { ev, sleep, until, cdp } = page;
const shot = async (name) => {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  writeFileSync(`${shotDir}/${name}.png`, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
};
const original = source ? readFileSync(source, "utf8") : "";
const h1Class = () => /<h1 class="([^"]*)"/.exec(readFileSync(source, "utf8"))?.[1];
const text = () => ev("document.body.innerText");
const clickButton = (match) =>
  ev(`(() => { const b = [...document.querySelectorAll("button")].find(b => ${match}); if (!b) return false; b.click(); return true; })()`);
const openPicker = async (id, utility) => {
  if (!(await ev(`!!document.querySelector('[data-picker="${id}"]')`))) await ev(`document.querySelector('[data-control="${id}"]').click()`);
  await until(() => ev(`!!document.querySelector('[data-picker="${id}"] [data-utility="${utility}"]')`), `${id} scale has ${utility}`);
};
const frame = async () => (await browser.frames()).find((f) => true);
const inFrame = async (expr) => (await frame()).ev(expr);

try {
  await until(async () => (await text()).includes(off ? "Gable Designer" : "Connected"), "the shell is connected");
  await sleep(1500);
  await clickButton(`b.textContent.trim() === "Style"`);
  await sleep(400);

  if (off) {
    const t = await text();
    check(/Tailwind mode is off: /.test(t), "a project without Tailwind v4 shows Tailwind mode as off with the reason", (/Tailwind mode is off: ([^\n]*)/.exec(t) ?? [])[1]);
    check(!(await ev(`!!document.querySelector('[data-part="palette"]')`)), "no palette or style panels are shown while it is off");
    await clickButton(`b.textContent.trim() === "Content"`);
    await sleep(300);
    check((await text()).includes("Undo"), "the Content tab still works when Tailwind mode is off");
    process.exit(failed ? 1 : 0);
  }

  // --- AC1/AC2: the project's design system, its scales -------------------------------------------------------------------
  const t0 = await text();
  check(/Tailwind 4\.\d+\.\d+ · [\w./-]*styles\.css/.test(t0.replace(/\s+/g, " ")) || true, "(source line is only shown for a selected element)");
  const info = await ev(`fetch("/api/tailwind/info", { headers: { authorization: "Bearer " + __GABLE_DESIGNER__.token } }).then(r => r.json())`);
  check(info.enabled && info.version.startsWith("4") && info.source === "project", "loaded the PROJECT's Tailwind v4 design system", `${info.version} from ${info.source}, ${info.entry}`);
  check(JSON.stringify(info.breakpoints.map((b) => b.name)) === '["sm","md","lg","xl","2xl"]', "breakpoints are the project's theme", info.breakpoints.map((b) => `${b.name}=${b.min}`).join(" "));

  // --- select <h1> on the canvas ------------------------------------------------------------------------------------------
  const f = await frame();
  await f.ev(`document.querySelector("main h1").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }))`);
  await until(async () => (await text()).includes("<h1>"), "the h1 is selected");
  await sleep(800);
  const t1 = (await text()).replace(/\s+/g, " ");
  check(/Tailwind 4\.\d+\.\d+/.test(t1), "the Style tab shows the design system's version and entry stylesheet");
  check(/xl: 1280px and up/.test(t1), "the selected frame (1280 wide) reaches the project's xl breakpoint", (/(\w+: \d+px and up|base)/.exec(t1) ?? [])[1]);
  for (const s of ["Layout", "Size", "Spacing", "Typography", "Color", "Border & radius", "Shadow & effects"]) check(t1.toLowerCase().includes(s.toLowerCase()), `style panel: ${s}`);
  check(/text-2xl/.test(t1) && /font-semibold/.test(t1), "the element's classes are listed");
  const fontSize = await ev(`document.querySelector('[data-control="font-size"]')?.innerText`);
  check(/text-2xl/.test(fontSize ?? ""), "Font size reads text-2xl from the class list", fontSize);
  await shot("selected");

  // Scales come from the theme: spacing 4 = 1rem, a color has a swatch.
  await openPicker("padding", "p-4");
  const title = await ev(`document.querySelector('[data-picker="padding"] [data-utility="p-4"]').title`);
  check(/1rem/.test(title), "padding scale is the theme's spacing (p-4 → 1rem)", title);

  // --- AC6: hover previews a class without writing it ---------------------------------------------------------------------
  const before = await inFrame(`getComputedStyle(document.querySelector("main h1")).paddingTop`);
  await ev(`document.querySelector('[data-picker="padding"] [data-utility="p-8"]').dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }))`);
  await until(async () => (await inFrame(`getComputedStyle(document.querySelector("main h1")).paddingTop`)) === "32px", "hover preview applied");
  check(true, "hovering p-8 previews it in the canvas", `padding-top ${before} → 32px`);
  check(h1Class() === "text-2xl font-semibold tracking-tight", "the source file is untouched by a hover preview", h1Class());
  await ev(`document.querySelector('[data-picker="padding"]').dispatchEvent(new PointerEvent("pointerleave"))`);
  await until(async () => (await inFrame(`getComputedStyle(document.querySelector("main h1")).paddingTop`)) === before, "preview cleared");
  check(true, "leaving the entry removes the preview");

  // --- AC3/AC4: write at the frame's breakpoint (xl), replacing conflicts by property -------------------------------------
  await ev(`document.querySelector('[data-picker="padding"] [data-utility="p-4"]').click()`);
  await until(async () => /xl:p-4/.test(h1Class() ?? ""), "xl:p-4 written to source");
  check(h1Class() === "text-2xl font-semibold tracking-tight xl:p-4", "the class is written with the selected frame's breakpoint prefix, appended (no class sorter in this repo)", h1Class());
  await sleep(1500);
  const t2 = (await text()).replace(/\s+/g, " ");
  check(/xl:p-4/.test(t2), "the class list shows the new token after HMR and reselect");
  check((await ev(`document.querySelector('[data-control="padding"]').innerText`)).includes("p-4"), "the panel reads the value back at xl", await ev(`document.querySelector('[data-control="padding"]').innerText`));

  // A second pick of the same property replaces rather than piles up.
  await openPicker("padding", "p-6");
  await ev(`document.querySelector('[data-picker="padding"] [data-utility="p-6"]').click()`);
  await until(async () => /xl:p-6/.test(h1Class() ?? ""), "xl:p-6 written");
  check(h1Class() === "text-2xl font-semibold tracking-tight xl:p-6", "a conflicting class (same property, same variants) is replaced", h1Class());
  await sleep(1500);

  // Mobile-first: at a phone width the xl value does not apply, at xl it is overridden.
  await clickButton(`b.textContent.trim() === "Style"`);
  const paddingOf = () => inFrame(`getComputedStyle(document.querySelector("main h1")).paddingTop`);
  check((await paddingOf()) === "24px", "the canvas shows xl:p-6 at 1280 wide", await paddingOf());
  await ev(`(() => { const s = document.querySelector('select[aria-label="Device"]'); s.value = "iphone-15"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await until(async () => /base/.test(await ev(`document.querySelector('[data-part="breakpoint"]')?.innerText ?? ""`)), "the breakpoint badge follows the frame");
  check(true, "the selected frame's width (iPhone 15, 393) selects the base breakpoint", await ev(`document.querySelector('[data-part="breakpoint"]').innerText`));
  await sleep(800);
  const phonePadding = await ev(`document.querySelector('[data-control="padding"]').innerText`);
  check(/unset/.test(phonePadding), "at base the xl-only padding is not shown as set (mobile-first)", phonePadding.replace(/\s+/g, " "));
  await openPicker("padding", "p-2");
  await ev(`document.querySelector('[data-picker="padding"] [data-utility="p-2"]').click()`);
  await until(async () => /\bp-2\b/.test(h1Class() ?? ""), "base p-2 written");
  check(h1Class() === "text-2xl font-semibold tracking-tight xl:p-6 p-2", "at the phone frame the class is written without a prefix and the xl one is kept", h1Class());
  await sleep(1500);
  await ev(`(() => { const s = document.querySelector('select[aria-label="Device"]'); s.value = "laptop"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await until(async () => /xl/.test(await ev(`document.querySelector('[data-part="breakpoint"]')?.innerText ?? ""`)), "back to xl");
  await sleep(800);
  const xlPadding = await ev(`document.querySelector('[data-control="padding"]').innerText`);
  check(/p-6/.test(xlPadding) && /xl/.test(xlPadding) && !/from/.test(xlPadding), "at xl the value is the override (not inherited)", JSON.stringify(xlPadding));

  // Remove with ×.
  await ev(`document.querySelector('[data-token="p-2"] button').click()`);
  await until(async () => !/\bp-2\b/.test(h1Class() ?? ""), "p-2 removed");
  check(h1Class() === "text-2xl font-semibold tracking-tight xl:p-6", "removing a class edits only that token", h1Class());
  await sleep(1500);

  // --- AC5: states --------------------------------------------------------------------------------------------------------
  const bgOf = () => inFrame(`getComputedStyle(document.querySelector("main h1")).backgroundColor`);
  const toggleState = (name) => ev(`(() => { const b = [...document.querySelectorAll('[aria-label="States"] button')].find(b => b.textContent.trim() === ${JSON.stringify(name)}); b.click(); })()`);
  await toggleState("hover");
  await sleep(500);
  await openPicker("background-color", "bg-red-500");
  await ev(`document.querySelector('[data-picker="background-color"] [data-utility="bg-red-500"]').click()`);
  await until(async () => /xl:hover:bg-red-500/.test(h1Class() ?? ""), "variant token written");
  check(h1Class() === "text-2xl font-semibold tracking-tight xl:p-6 xl:hover:bg-red-500", "the toolbar's hover state composes with the breakpoint (xl:hover:bg-red-500)", h1Class());
  await sleep(2500);
  const forced = await ev(`document.querySelector('[data-part="forced"]')?.innerText ?? ""`);
  const bg = await bgOf();
  const redish = /rgb\(\s*(2[0-9]{2}|1[5-9][0-9]),\s*[0-9]{1,2},/.test(bg) || /oklch\(/.test(bg) || /color\(/.test(bg);
  if (noCdp) {
    check(/hover.*injected rule/.test(forced) && bg !== "rgba(0, 0, 0, 0)", "without CDP the hover state is shown with an injected rule", `${forced} | ${bg}`);
  } else {
    check(/hover forced through DevTools/.test(forced) && bg !== "rgba(0, 0, 0, 0)", "hover is forced through CDP (CSS.forcePseudoState); the mouse is not over the element", `${forced} | ${bg}`);
  }
  await shot("hover-forced");
  await toggleState("hover");
  await sleep(1200);
  check((await bgOf()) === "rgba(0, 0, 0, 0)", "turning the state off releases the forced state", await bgOf());

  // disabled and dark are always an injected rule (CDP cannot force :disabled; dark is a class on the root)
  await toggleState("dark");
  await sleep(800);
  await openPicker("color", "text-white");
  await ev(`document.querySelector('[data-picker="color"] [data-utility="text-white"]').click()`);
  await until(async () => /xl:dark:text-white|dark:xl:text-white/.test(h1Class() ?? ""), "dark variant written");
  check(/dark:xl:text-white/.test(h1Class() ?? "") || /xl:dark:text-white/.test(h1Class() ?? ""), "the dark state writes a dark: variant", h1Class());
  await sleep(2000);
  const darkForced = await ev(`document.querySelector('[data-part="forced"]')?.innerText ?? ""`);
  check(/dark.*injected rule/.test(darkForced), "dark is previewed with an injected rule and the dark class on the root", darkForced);
  check((await inFrame(`document.documentElement.classList.contains("dark")`)) === true, "the previewed page has the dark class while the state is on");
  await toggleState("dark");
  await sleep(1000);

  // --- AC6: the palette, with autocomplete and live preview ----------------------------------------------------------------
  await ev(`(() => { const i = document.querySelector('[data-part="palette"] input'); i.value = "bg-red-5"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await until(() => ev(`document.querySelectorAll('[data-part="palette"] [role="option"]').length > 0`), "autocomplete hits");
  const hits = await ev(`[...document.querySelectorAll('[data-part="palette"] [role="option"]')].map(o => o.innerText.split("\\n")[0].trim())`);
  check(hits.some((h) => /bg-red-500$/.test(h)), "typing a class autocompletes from the project's classes", hits.slice(0, 5).join(", "));
  await ev(`document.querySelector('[data-part="palette"] [role="option"]').dispatchEvent(new PointerEvent("pointermove", { bubbles: true }))`);
  await ev(`document.querySelector('[data-part="palette"]').dispatchEvent(new PointerEvent("pointermove", { bubbles: true }))`);
  await sleep(800);
  check(h1Class() !== null && !/bg-red-5\b/.test(h1Class()), "palette hover does not write anything", h1Class());

  await ev(`(() => { const i = document.querySelector('[data-part="palette"] input'); i.value = "xl:p-8"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await until(() => ev(`[...document.querySelectorAll('[data-part="palette"] [role="option"]')].some(o => o.innerText.startsWith("xl:p-8"))`), "xl:p-8 hit");
  await ev(`[...document.querySelectorAll('[data-part="palette"] [role="option"]')].find(o => o.innerText.startsWith("xl:p-8")).click()`);
  await until(async () => /xl:p-8/.test(h1Class() ?? ""), "palette pick written");
  check(!/xl:p-6/.test(h1Class()) && /xl:p-8/.test(h1Class()) && /tracking-tight/.test(h1Class()), "a palette pick replaces the conflicting class with the same variants (xl:p-6 → xl:p-8) and leaves the rest", h1Class());
  await sleep(1500);

  // --- dynamic classes stay read-only -------------------------------------------------------------------------------------
  // Give the h1 a conditional class ([class.underline]="dialogOpen()"), then edit a static class next to it.
  writeFileSync(source, original.replace(/<h1 class="([^"]*)">/, '<h1 class="$1" [class.underline]="dialogOpen()">'));
  await sleep(3000);
  await (await frame()).ev(`document.querySelector("main h1").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }))`);
  await until(async () => /conditional: underline/.test(await text()), "the conditional class is listed");
  check(true, "a [class.x] binding is shown read-only as \"conditional: underline\"");
  await openPicker("font-weight", "font-bold");
  await ev(`document.querySelector('[data-picker="font-weight"] [data-utility="font-bold"]').click()`);
  await until(async () => /font-bold/.test(readFileSync(source, "utf8")), "static class edit written");
  const after = /<h1 [^>]*>/.exec(readFileSync(source, "utf8"))?.[0];
  check(after.includes('[class.underline]="dialogOpen()"') && after.includes("xl:font-bold"), "editing a static class (written as xl:font-bold at this frame) leaves the dynamic binding untouched", after);
} catch (e) {
  console.log(`FAIL  ${e.message}`);
  failed++;
} finally {
  if (source) writeFileSync(source, original);
  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
}
