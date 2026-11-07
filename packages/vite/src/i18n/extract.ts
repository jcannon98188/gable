import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { extractTemplateMessages, messageFromStrings, messageId, type ExtractedMessage } from "@gable/core/tooling";
import { cook, lineOf, scanTemplates } from "./scan.js";

/** Messages of one source file: the markers in its `html` templates and its `i18n` tagged templates. */
export function extractFromSource(code: string, file: string): ExtractedMessage[] {
  if (!code.includes("i18n")) return [];
  const out: ExtractedMessage[] = [];
  for (const hit of scanTemplates(code)) {
    const line = lineOf(code, hit.start);
    if (hit.tag === "html") {
      if (hit.holes.length > 0 || !hit.raw[0]!.includes("i18n")) continue;
      assertNoEscapes(hit.raw[0]!, file, line);
      try {
        out.push(...extractTemplateMessages(hit.raw[0]!, { file, firstLine: line }));
      } catch (error) {
        throw new Error(`${file}:${line}: ${(error as Error).message}`);
      }
    } else {
      const { message, marker } = messageFromStrings(hit.raw.map(cook), hit.raw);
      out.push({
        id: marker.id ?? messageId(message, marker.description),
        message,
        description: marker.description,
        placeholders: hit.holes.map((h) => code.slice(h.start, h.end).trim()),
        location: `${file}:${line}`,
      });
    }
  }
  return out;
}

export function assertNoEscapes(raw: string, file: string, line: number): void {
  if (raw.includes("\\")) throw new Error(`${file}:${line}: an html template with i18n markers cannot contain backslash escapes (the build reads the template text as written)`);
}

const SOURCE = /\.(?:[mc]?[jt]sx?)$/;

/** Every source file under `dirs` (relative to `root`), skipping node_modules, dot folders, declaration files and tests. */
export function listSourceFiles(root: string, dirs: readonly string[]): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(full);
      } else if (SOURCE.test(e.name) && !/\.d\.[mc]?ts$|\.(?:test|spec)\./.test(e.name)) files.push(full);
    }
  };
  for (const d of dirs) walk(join(root, d));
  return files.sort();
}

/** Extracts the messages of every source file under `dirs`. Locations are relative to `root`, with forward slashes. */
export function extractProject(root: string, dirs: readonly string[] = ["src"]): ExtractedMessage[] {
  const out: ExtractedMessage[] = [];
  for (const file of listSourceFiles(root, dirs)) {
    out.push(...extractFromSource(readFileSync(file, "utf8"), relative(root, file).replace(/\\/g, "/")));
  }
  return out;
}
