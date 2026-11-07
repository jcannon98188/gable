import type { ApiPackage } from "./api-types.js";
import { markdownText, type MarkdownDoc } from "./markdown.js";
import { GUIDES } from "./content.js";
import { apiUrl, guideUrl, packageUrl, symbolUrl } from "./urls.js";

export interface SearchEntry {
  title: string;
  /** Where it lives, shown under the title. */
  where: string;
  kind: "Guide" | "Section" | "API" | "Package";
  url: string;
  /** Lower-cased title and body. */
  t: string;
  b: string;
}

export interface SearchHit {
  entry: SearchEntry;
  score: number;
}

const entry = (title: string, where: string, kind: SearchEntry["kind"], url: string, body: string): SearchEntry => ({
  title,
  where,
  kind,
  url,
  t: title.toLowerCase(),
  b: body.toLowerCase().slice(0, 4000),
});

/** The headings and text of the guides and every documented symbol, as flat entries. */
export function buildSearchIndex(guides: ReadonlyMap<string, MarkdownDoc>, packages: readonly ApiPackage[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const g of GUIDES) {
    const doc = guides.get(g.slug);
    if (!doc) continue;
    out.push(entry(g.title, g.group, "Guide", guideUrl(g.slug), g.summary));
    // One entry per h2/h3 section, with the text that follows it.
    let current: { id: string; text: string; body: string[] } | null = null;
    const flush = () => current && out.push(entry(current.text, g.title, "Section", guideUrl(g.slug, current.id), current.body.join(" ")));
    for (const b of doc.blocks) {
      if (b.kind === "h2" || b.kind === "h3") {
        flush();
        current = { id: b.id, text: b.text, body: [] };
      } else if (current) current.body.push(markdownText({ blocks: [b], toc: [], title: "" }));
    }
    flush();
  }
  for (const p of packages) {
    out.push(entry(p.name, "Package", "Package", packageUrl(p.slug), p.description));
    out.push(entry(`${p.name} API reference`, "Package", "Package", apiUrl(p.slug), p.description));
    for (const ep of p.entryPoints) {
      for (const s of ep.symbols) {
        out.push(entry(s.name, `${ep.path} · ${s.kind}`, "API", symbolUrl(p.slug, s), `${s.signature} ${s.summary}`));
      }
    }
  }
  return out;
}

/** Every word of the query must appear; title matches beat body matches, exact and prefix matches beat the rest. */
export function search(index: readonly SearchEntry[], query: string, limit = 12): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: SearchHit[] = [];
  for (const e of index) {
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (e.t === w) score += 100;
      else if (e.t.startsWith(w)) score += 60;
      else if (e.t.includes(w)) score += 40;
      else if (e.b.includes(w)) score += 10;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (e.kind === "API") score += 5;
    hits.push({ entry: e, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length).slice(0, limit);
}
