// THROWAWAY SPIKE check of the file side of the mapping (no browser): given a synthetic agent report, resolve a range.
import { resolveSource } from "./resolve.mjs";
import { readFileSync } from "node:fs";
const root = new URL("../../examples/todomvc", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const file = root + "/src/components/todo-item.ts";
const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const open = text.indexOf("html`") + 5, close = text.indexOf("`", open);
const raw = text.slice(open, close);
const start = raw.indexOf("<label"), end = raw.indexOf("</label>") + 8;
const r = resolveSource(root, { component: { source: { file } }, raw, start, openEnd: raw.indexOf(">", start) + 1, end });
console.log(r);
if (r.text !== raw.slice(start, end)) throw new Error("mismatch");
