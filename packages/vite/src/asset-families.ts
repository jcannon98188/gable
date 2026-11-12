import { readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

const QUERY = /\?family$/;
const PREFIX = "\0gable-family:";
// The suffix keeps the virtual id from looking like a .json file to Vite's own JSON plugin.
const SUFFIX = "::family.js";
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;

/** The sibling files a descriptor points at, and how to write a replacement path for each back into it. */
interface Descriptor {
  refs: string[];
  /** Whether a reference is itself a descriptor (a spritesheet's other packs) rather than a plain file. */
  nested: Set<string>;
  rewrite(map: (ref: string) => string): string;
}

/**
 * Reads the references out of a spritesheet JSON (`meta.image`, `meta.related_multi_packs`) or a bitmap-font
 * descriptor (`.fnt` text or `.xml`: `page ... file="x.png"`). Returns null for a file that is neither.
 */
export function describeFamily(file: string, source: string): Descriptor | null {
  if (/\.json$/i.test(file)) {
    let data: { meta?: { image?: unknown; related_multi_packs?: unknown } };
    try {
      data = JSON.parse(source);
    } catch {
      return null;
    }
    const meta = data?.meta;
    if (!meta || typeof meta !== "object") return null;
    const packs = Array.isArray(meta.related_multi_packs) ? meta.related_multi_packs.filter((p): p is string => typeof p === "string") : [];
    const image = typeof meta.image === "string" ? meta.image : null;
    return {
      refs: [...(image ? [image] : []), ...packs],
      nested: new Set(packs),
      rewrite(map) {
        if (image) meta.image = map(image);
        if (packs.length) meta.related_multi_packs = (meta.related_multi_packs as unknown[]).map((p) => (typeof p === "string" ? map(p) : p));
        return JSON.stringify(data);
      },
    };
  }
  if (/\.(?:fnt|xml)$/i.test(file)) {
    const pages = /(\bfile\s*=\s*)"([^"]+)"/g;
    const refs = [...source.matchAll(pages)].map((m) => m[2]!);
    return { refs, nested: new Set(), rewrite: (map) => source.replace(pages, (_, lead: string, ref: string) => `${lead}"${map(ref)}"`) };
  }
  return null;
}

/**
 * Hashes asset families whose descriptor names sibling files by relative path: spritesheet JSON and bitmap-font
 * descriptors. Plain `import url from "./hero.png"` is hashed by Vite already, but a descriptor imported the same
 * way gets a hashed name while the PNG next to it keeps (or loses) its own, so Pixi's relative lookup misses.
 *
 * Import the descriptor with the `?family` query and use the default export (a URL) as the bundle entry's `src`:
 * the manifest API is untouched.
 *
 * - Dev: the URL is the descriptor's served path; siblings are served beside it, so nothing is rewritten.
 * - Build: every sibling is emitted with a hashed name, the descriptor is rewritten to point at those names and
 *   emitted with a hash of its rewritten content, and the export is the descriptor's final, base-aware URL.
 *
 * @example
 * ```ts
 * import heroSheet from "./hero.json?family";
 * provideAssets({ bundles: { level1: [{ alias: "hero", src: heroSheet }] } });
 * ```
 */
export function gableAssetFamilies(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "gable-asset-families",
    enforce: "pre",
    configResolved(c) {
      config = c;
    },
    async resolveId(source, importer, options) {
      if (!QUERY.test(source)) return null;
      const resolved = await this.resolve(source.replace(QUERY, ""), importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      return PREFIX + resolved.id.split("?")[0]! + SUFFIX;
    },
    load(id) {
      if (!id.startsWith(PREFIX)) return null;
      const file = id.slice(PREFIX.length, -SUFFIX.length);
      if (config.command === "serve") {
        const url = relative(config.root, file).split(sep).join("/");
        const served = url.startsWith("..") || isAbsolute(url) ? `/@fs/${file.split(sep).join("/")}` : `/${url}`;
        return `export default ${JSON.stringify(config.base.replace(/\/$/, "") + served)};`;
      }
      const emitted = new Map<string, { ref: string; fileName: string } | null>();
      const emitFamily = (descriptorFile: string): { ref: string; fileName: string } => {
        const done = emitted.get(descriptorFile);
        if (done) return done;
        if (done === null) throw new Error(`Asset family cycle at ${descriptorFile}.`);
        emitted.set(descriptorFile, null);
        const family = describeFamily(descriptorFile, readFileSync(descriptorFile, "utf8"));
        if (!family) throw new Error(`${descriptorFile} is not a spritesheet JSON or a bitmap-font descriptor, so "?family" cannot rewrite it.`);
        this.addWatchFile(descriptorFile);
        const rewritten = family.rewrite((ref) => {
          if (EXTERNAL.test(ref)) return ref;
          const target = resolve(dirname(descriptorFile), ref);
          this.addWatchFile(target);
          const fileName = family.nested.has(ref)
            ? emitFamily(target).fileName
            : this.getFileName(this.emitFile({ type: "asset", name: basename(target), originalFileName: target, source: readFileSync(target) }));
          // All assets land in one directory by default; a custom assetFileNames split would need a longer path.
          return posix.basename(fileName);
        });
        const ref = this.emitFile({ type: "asset", name: basename(descriptorFile), originalFileName: descriptorFile, source: rewritten });
        const result = { ref, fileName: this.getFileName(ref) };
        emitted.set(descriptorFile, result);
        return result;
      };
      return `export default "__VITE_ASSET__${emitFamily(file).ref}__";`;
    },
  };
}

