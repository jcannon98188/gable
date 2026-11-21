// gableServiceWorker(): at production build, emits the asset manifest and the service worker file (ADR 0022).
//
// The plugin never imports @gablejs/service-worker itself: the worker it bundles does, from the app's dependencies, and
// the default worker's config is checked through a dynamic import at build time. Apps without the plugin pay nothing.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { build, normalizePath, type Plugin, type ResolvedConfig, type Rollup } from "vite";

/** Options for {@link gableServiceWorker}. Every one is optional. */
export interface GableServiceWorkerOptions {
  /**
   * The default worker's config, relative to the project root. Defaults to `"gable.sw.json"`. Ignored when
   * {@link entry} is set.
   */
  readonly config?: string;
  /**
   * A custom worker module, relative to the project root, in place of the default worker. Its default export is
   * either a function `(self, manifest) => void`, which sets the worker up with core's API, or the result of
   * `defineWorker()` from `@gablejs/service-worker/runtime`. The worker file calls it once, when it runs, with the
   * worker's `self` and the build's {@link EmittedAssetManifest}.
   */
  readonly entry?: string;
  /**
   * The worker file's name in the output directory. Defaults to `"sw.js"`, served at `<base>sw.js`. It is not
   * content-hashed: the browser looks for updates at a fixed URL and compares the bytes.
   */
  readonly fileName?: string;
  /** The asset manifest's file name in the output directory. Defaults to `"sw-manifest.json"`. */
  readonly manifestFileName?: string;
}

/**
 * The asset manifest a production build emits, written as JSON next to the worker file and built into the worker.
 * It is an `AssetManifest` of `@gablejs/service-worker/runtime`, plus each file's content hash.
 */
export interface EmittedAssetManifest {
  /**
   * The release: a hash over the worker's code (which includes the default worker's config) and every file's
   * content hash. Any change to either makes a new release.
   */
  readonly version: string;
  /**
   * Every file the build emitted, the public directory's included, as a path from the origin's root (`base`
   * included), sorted. The worker file, the manifest and source maps are left out.
   */
  readonly files: readonly string[];
  /** Each file's content hash: the first 16 hex digits of the SHA-256 of its bytes, by path. */
  readonly hashes: Readonly<Record<string, string>>;
}

const ENTRY = "virtual:gable-sw-entry";
const DEFAULT_WORKER = "virtual:gable-sw-default-worker";
const MANIFEST = "virtual:gable-sw-manifest";
/** Stands for the manifest in the bundled worker until its version, which hashes the bundle, is known. */
const PLACEHOLDER = "__GABLE_SW_MANIFEST__";
const PLACEHOLDER_LITERAL = new RegExp(`(["'\`])${PLACEHOLDER}\\1`, "g");

const hash = (content: string | Uint8Array) => createHash("sha256").update(content).digest("hex").slice(0, 16);
const fail = (message: string) => new Error(`@gablejs/vite gableServiceWorker(): ${message}`);

/** The files under `dir`, as `/`-separated paths relative to it. */
function walk(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name), `${prefix}${entry.name}/`) : entry.isFile() ? [`${prefix}${entry.name}`] : [],
  );
}

/** What the default worker's build-time check needs from `@gablejs/service-worker/runtime`. */
interface RuntimeChecks {
  validateConfig(config: unknown): unknown;
  validateManifest(config: unknown, manifest: unknown): unknown;
}

async function loadRuntime(): Promise<RuntimeChecks> {
  // A variable specifier keeps @gablejs/vite's own build from needing the package's types.
  const specifier: string = "@gablejs/service-worker/runtime";
  try {
    return (await import(/* @vite-ignore */ specifier)) as RuntimeChecks;
  } catch (error) {
    throw fail(`the default worker needs @gablejs/service-worker; install it with "npm install @gablejs/service-worker" (${String(error)})`);
  }
}

/** Bundles the worker into one classic script, with the manifest still a placeholder. */
async function bundleWorker(config: ResolvedConfig, worker: string, defaultWorker?: string): Promise<string> {
  const entry = [
    `import worker from ${JSON.stringify(worker)};`,
    `import manifest from ${JSON.stringify(MANIFEST)};`,
    `if (typeof worker === "function") worker(self, manifest);`,
    `else if (worker && typeof worker.start === "function") worker.start(self, manifest);`,
    `else throw new TypeError("gable service worker: the worker module's default export must be a function (self, manifest) or a defineWorker() result");`,
  ].join("\n");
  const virtual: Record<string, string> = { [ENTRY]: entry, [MANIFEST]: `export default JSON.parse(${JSON.stringify(PLACEHOLDER)});` };
  if (defaultWorker !== undefined) virtual[DEFAULT_WORKER] = defaultWorker;
  const out = (await build({
    configFile: false,
    root: config.root,
    mode: config.mode,
    logLevel: config.logLevel,
    publicDir: false,
    envDir: config.envDir,
    define: config.define,
    resolve: { alias: config.resolve.alias },
    plugins: [
      {
        name: "gable:service-worker-entry",
        resolveId: (id) => (id in virtual ? `\0${id}` : undefined),
        load: (id) => (id.startsWith("\0") ? virtual[id.slice(1)] : undefined),
      },
    ],
    build: {
      write: false,
      copyPublicDir: false,
      emptyOutDir: false,
      minify: config.build.minify,
      target: config.build.target,
      sourcemap: false,
      modulePreload: false,
      reportCompressedSize: false,
      rolldownOptions: { input: ENTRY, output: { format: "iife", entryFileNames: "sw.js" } },
    },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[];
  const chunk = (Array.isArray(out) ? out[0]! : out).output.find((o): o is Rollup.OutputChunk => o.type === "chunk" && o.isEntry);
  if (!chunk) throw fail("bundling the worker produced no script");
  return chunk.code;
}

/**
 * Service worker support for production builds (`@gablejs/service-worker`, ADR 0022). `vite build` emits two files
 * into the output directory:
 *
 * - the asset manifest, `sw-manifest.json` ({@link EmittedAssetManifest}): every emitted file with its content hash,
 *   and a version that changes whenever a file, the config or the worker's code does;
 * - the worker file, `sw.js`: one classic script with the manifest built in, so each release is a new worker that
 *   installs into its own caches and waits for the app's `activateUpdate()`.
 *
 * The worker is the default one, `@gablejs/service-worker/runtime` driven by `gable.sw.json` (checked against the
 * manifest at build time), or a custom module named by `entry`. Register it from the app with
 * `provideServiceWorker({ url: "/sw.js" })`. The dev server gets nothing: no worker file, no manifest, and the app
 * side does not register there, so HMR is unaffected.
 *
 * @param options - Where the config or a custom worker is, and the emitted files' names.
 * @returns A Vite plugin; list it in `plugins` next to `gable()`.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import { gable, gableServiceWorker } from "@gablejs/vite";
 *
 * export default defineConfig({ plugins: [gable(), gableServiceWorker()] });
 * ```
 */
export function gableServiceWorker(options: GableServiceWorkerOptions = {}): Plugin {
  const fileName = options.fileName ?? "sw.js";
  const manifestFileName = options.manifestFileName ?? "sw-manifest.json";
  let config: ResolvedConfig;
  return {
    name: "gable:service-worker",
    apply: "build",
    enforce: "post",
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle: {
      order: "post",
      async handler(_, bundle) {
        if (this.environment.config.consumer !== "client") return;
        if (!config.base.startsWith("/")) {
          throw fail(`base must be an absolute path such as "/" or "/app/", got "${config.base}": the manifest lists paths from the origin's root`);
        }
        // Everything the build writes: its bundle, and the public directory Vite copies next to it.
        const contents = new Map<string, string | Uint8Array>();
        for (const output of Object.values(bundle)) contents.set(output.fileName, output.type === "chunk" ? output.code : output.source);
        if (config.publicDir && config.build.copyPublicDir && existsSync(config.publicDir)) {
          for (const file of walk(config.publicDir)) if (!contents.has(file)) contents.set(file, readFileSync(join(config.publicDir, file)));
        }
        for (const name of [fileName, manifestFileName]) {
          if (contents.has(name)) throw fail(`the build already emits ${name}; remove it or choose another file name`);
        }
        const hashes: Record<string, string> = {};
        for (const [file, content] of [...contents].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
          if (!file.endsWith(".map")) hashes[config.base + file] = hash(content);
        }
        const files = Object.keys(hashes);

        let code: string;
        if (options.entry) {
          const entry = resolve(config.root, options.entry);
          if (!existsSync(entry)) throw fail(`the worker entry ${options.entry} does not exist in ${config.root}`);
          code = await bundleWorker(config, normalizePath(entry));
        } else {
          const configFile = resolve(config.root, options.config ?? "gable.sw.json");
          if (!existsSync(configFile)) {
            throw fail(`${relative(config.root, configFile)} not found; create it, or set entry to a custom worker`);
          }
          const runtime = await loadRuntime();
          const checked = runtime.validateConfig(JSON.parse(readFileSync(configFile, "utf8")));
          runtime.validateManifest(checked, { version: "build", files });
          const source = [
            `import { defineWorker } from "@gablejs/service-worker/runtime";`,
            `import config from ${JSON.stringify(normalizePath(configFile))};`,
            `export default defineWorker({ config });`,
          ].join("\n");
          code = await bundleWorker(config, DEFAULT_WORKER, source);
        }

        const version = hash(`${code}\n${files.map((file) => `${file} ${hashes[file]}`).join("\n")}`);
        const manifest: EmittedAssetManifest = { version, files, hashes };
        let replaced = 0;
        const script = code.replace(PLACEHOLDER_LITERAL, () => (replaced++, JSON.stringify(JSON.stringify(manifest))));
        if (replaced !== 1) throw fail(`expected the manifest placeholder once in the bundled worker, found it ${replaced} times`);
        this.emitFile({ type: "asset", fileName, source: script });
        this.emitFile({ type: "asset", fileName: manifestFileName, source: `${JSON.stringify(manifest, null, 2)}\n` });
      },
    },
  };
}
