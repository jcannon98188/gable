// The insert palette: plain HTML elements, the gable-ui components installed in the project, and the project's own components.
// Components are found by reading the project's sources for `static meta = { selector: ... }`: no running app is needed, so the
// palette works in page mode and in component mode alike.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { PaletteEntry } from "./types.js";

const HTML: Array<[string, string]> = [
  ["div", "<div></div>"],
  ["span", "<span>Text</span>"],
  ["p", "<p>Paragraph</p>"],
  ["h1", "<h1>Heading</h1>"],
  ["h2", "<h2>Heading</h2>"],
  ["a", '<a href="#">Link</a>'],
  ["button", "<button>Button</button>"],
  ["input", '<input type="text" />'],
  ["label", "<label>Label</label>"],
  ["img", '<img src="" alt="" />'],
  ["ul", "<ul>\n  <li>Item</li>\n</ul>"],
  ["li", "<li>Item</li>"],
  ["section", "<section></section>"],
];

const SKIP = new Set(["node_modules", "dist", ".git", ".vite", "target", "coverage"]);

function sources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith(".")) walk(join(dir, e.name));
      } else if (/\.ts$/.test(e.name) && !/\.(test|scenes|d)\.ts$/.test(e.name)) out.push(join(dir, e.name));
    }
  };
  walk(root);
  return out;
}

/** `app-foo` → `<app-foo></app-foo>`; `li[app-item]` → `<li app-item></li>`; `[uiButton]` → `<button uiButton></button>`; `.x` and the rest are skipped. */
export function snippetFor(selector: string): string | null {
  const s = selector.trim();
  const m = /^([a-zA-Z][\w-]*)?((?:\[[\w-]+(?:=[^\]]*)?\])*)$/.exec(s);
  if (!m || (!m[1] && !m[2])) return null;
  const tag = m[1] ?? "div";
  const attrs = [...m[2]!.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)].map((a) => (a[2] === undefined ? a[1]! : `${a[1]}="${a[2]}"`));
  const open = `<${tag}${attrs.map((a) => " " + a).join("")}>`;
  return `${open}</${tag}>`;
}

export function buildPalette(root: string): PaletteEntry[] {
  const entries: PaletteEntry[] = HTML.map(([name, snippet]) => ({ group: "html", name, snippet }));
  let uiDir = "components/ui";
  try {
    const cfg = JSON.parse(readFileSync(join(root, "gable-ui.json"), "utf8")) as { componentsDir?: string };
    if (cfg.componentsDir) uiDir = cfg.componentsDir.replace(/^\.?\//, "");
  } catch {
    // no gable-ui.json: the conventional place
  }
  const found: PaletteEntry[] = [];
  for (const file of existsSync(root) ? sources(root) : []) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("static meta")) continue;
    const rel = relative(root, file).split(sep).join("/");
    for (const m of text.matchAll(/(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{\s*(?:\/\/[^\n]*\n\s*)*static\s+meta\b[^=]*=\s*\{/g)) {
      const open = m.index! + m[0].length - 1;
      const selector = /selector\s*:\s*(['"`])(.*?)\1/.exec(text.slice(open, open + 400))?.[2];
      if (!selector) continue;
      const snippet = snippetFor(selector);
      if (!snippet) continue;
      const isUi = rel.startsWith(uiDir + "/") || rel.includes("/" + uiDir + "/");
      found.push({ group: isUi ? "gable-ui" : "project", name: m[1]!, snippet, selector, component: { name: m[1]!, file: rel } });
    }
  }
  found.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  return [...entries, ...found];
}
