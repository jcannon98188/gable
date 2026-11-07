import type { RegistryItem } from "./types.js";

const open = (name: string) => `/* gable-ui:${name} */`;
const close = (name: string) => `/* /gable-ui:${name} */`;

/** The CSS an item contributes: its variables in `:root` and `.dark`, then its raw CSS. Empty when it has neither. */
export function cssFor(item: Pick<RegistryItem, "cssVars" | "css">): string {
  const rule = (selector: string, vars: Record<string, string> | undefined) =>
    vars && Object.keys(vars).length > 0 ? `${selector} {\n${Object.entries(vars).map(([k, v]) => `  ${k.startsWith("--") ? k : `--${k}`}: ${v};`).join("\n")}\n}\n` : "";
  return [rule(":root", item.cssVars?.light), rule(".dark", item.cssVars?.dark), item.css?.trimEnd() ? item.css.trimEnd() + "\n" : ""].filter(Boolean).join("\n");
}

/** Puts `body` between marker comments named `name`: replaces the block when it is there, appends it otherwise. */
export function upsertBlock(css: string, name: string, body: string): string {
  const block = `${open(name)}\n${body.trimEnd()}\n${close(name)}\n`;
  const start = css.indexOf(open(name));
  const end = css.indexOf(close(name));
  if (start !== -1 && end > start) return css.slice(0, start) + block + css.slice(end + close(name).length).replace(/^\n/, "");
  return (css.trimEnd() ? css.trimEnd() + "\n\n" : "") + block;
}

/** Adds `@import "<name>";` lines the stylesheet lacks, at the top, in the order given. */
export function ensureImports(css: string, imports: string[]): string {
  const missing = imports.filter((name) => !new RegExp(`@import\\s+(url\\()?["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(css));
  return missing.length ? missing.map((name) => `@import "${name}";`).join("\n") + "\n" + (css ? "\n" + css : "") : css;
}
