// Keeps the code blocks in the docs identical to the starter template.
//
// A docs page marks a block with `<!-- template: <path> -->` on the line before a fenced code block. This
// replaces the fence's body with the template file's current contents. `node scripts/sync-docs.mjs` rewrites
// the pages; the scaffold tests import `syncDocs` and assert the pages are already in sync.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const templateDir = `${root}template/`;
export const docsDir = fileURLToPath(new URL("../../../docs/", import.meta.url));
export const pages = ["getting-started.md", "manual-setup.md"];

const MARKED_BLOCK = /(<!-- template: (\S+) -->\n```[a-z]*\n)[\s\S]*?(```)/g;

/** The page text with every marked block replaced by its template file. */
export function syncDocs(text) {
  return text.replace(MARKED_BLOCK, (_, open, path, close) => open + readFileSync(templateDir + path, "utf8").trimEnd() + "\n" + close);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const page of pages) {
    const file = docsDir + page;
    writeFileSync(file, syncDocs(readFileSync(file, "utf8")));
  }
}
