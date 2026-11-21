import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain script, no declarations
import { docsDir, pages, syncDocs, templateDir } from "../scripts/sync-docs.mjs";

const read = (file: string) => readFileSync(file, "utf8");
/** Marked blocks show the service worker option's files by this path, relative to the template. */
const SERVICE_WORKER = "../template-service-worker/";
const files = (dir: string, rel = ""): string[] =>
  readdirSync(dir).flatMap((entry) => (statSync(dir + entry).isDirectory() ? files(`${dir}${entry}/`, `${rel}${entry}/`) : [rel + entry]));

describe("docs mirror the starter template", () => {
  it("has a Getting started page and a manual-setup page", () => {
    expect(pages).toEqual(["getting-started.md", "manual-setup.md"]);
    for (const page of pages) expect(read(docsDir + page).length).toBeGreaterThan(500);
  });

  it.each(pages as string[])("%s shows each marked template file exactly as it is on disk", (page) => {
    const text = read(docsDir + page);
    expect(text).toMatch(/<!-- template: /);
    expect(syncDocs(text)).toBe(text); // run `node packages/create-gable/scripts/sync-docs.mjs` after editing the template
  });

  it("Getting started shows every starter source file", () => {
    const text = read(docsDir + "getting-started.md");
    const listed = [...text.matchAll(/<!-- template: (\S+) -->/g)].map((m) => m[1]!).filter((f) => !f.startsWith(SERVICE_WORKER));
    const expected = files(templateDir).filter((f) => f !== "README.md" && f !== "_gitignore" && f !== ".prettierignore" && f !== "index.html");
    expect(listed.sort()).toEqual(expected.sort());
  });

  it("Getting started shows every file of the service worker option", () => {
    const text = read(docsDir + "getting-started.md");
    const listed = [...text.matchAll(/<!-- template: (\S+) -->/g)].map((m) => m[1]!).filter((f) => f.startsWith(SERVICE_WORKER));
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.sort()).toEqual(files(templateDir + SERVICE_WORKER).map((f) => SERVICE_WORKER + f).sort());
  });

  it("teaches the day-one HMR limits", () => {
    const text = read(docsDir + "getting-started.md");
    expect(text).toMatch(/Renamed fields lose their value/);
    expect(text).toContain('static hmr = "reset"');
  });

  it("manual setup covers the plugin line, the tsconfig requirements, the entry file and the renderer option", () => {
    const text = read(docsDir + "manual-setup.md");
    expect(text).toContain("gable()");
    expect(text).toContain("useDefineForClassFields");
    expect(text).toContain("bootstrap(");
    expect(text).toContain('"renderer": "@gablejs/renderer-dom"');
  });
});
