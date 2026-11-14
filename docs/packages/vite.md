# @gable/vite

The Vite plugins for Gable. `gable()` sets up the build and dev server for Gable's native-class-field components, `gableI18n()` extracts translation messages and can bake one build per locale, and `gableServiceWorker()` emits the service worker and its asset manifest. Vite 8 or newer is required, and `@gable/core` is a peer dependency.

## Install

```
npm install -D @gable/vite
```

`npm create gable@latest` sets this up for you ([create-gable](./create-gable.md)). For an existing app see [Manual setup](../manual-setup.md).

## `gable()`

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { gable } from "@gable/vite";

export default defineConfig({ plugins: [gable()] });
```

`gable()` takes no options. What it does:

- **Dev server only:** appends a self-accept line to every module that exports something and imports from `@gable/*`, so edits hot-reload a component in place through `@gable/core/hmr`. It also tells the [devtools extension](../devtools.md) where the project is, so it can open a component's source file. No template or metadata parsing happens. Production builds get no Gable transform.
- **Always:** compiles with native class fields at `ES2022` and no decorators, keeps `@gable/core`, `@gable/renderer-dom` and `@gable/testing` out of dependency pre-bundling, and dedupes `@gable/core` so there is one copy. In `vite build` it defines `__GABLE_DEV__` as `false`.
- **Fail fast:** at startup it reads your `tsconfig.json` (following `extends` and project references) and stops with a clear error when `useDefineForClassFields` is `false`, when `experimentalDecorators` or `emitDecoratorMetadata` is `true`, or when `target` is older than `ES2022` without `useDefineForClassFields: true`. The error names the file and option. See [tsconfig requirements](../manual-setup.md) for a matching configuration.

## `gableI18n()`

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { gable, gableI18n } from "@gable/vite";

export default defineConfig({
  plugins: [
    gable(),
    gableI18n({
      sourceLocale: "en",
      locales: ["fr", "de"],
      catalogs: "src/locales/messages.{locale}.json",
      bake: { onMissing: "error" },
    }),
  ],
});
```

Only `locales` is required.

| Option | Default | |
| --- | --- | --- |
| `locales` | none | The target locales. The source locale needs no catalog. |
| `sourceLocale` | `"en"` | The language the templates are written in. |
| `catalogs` | `"src/locales/messages.{locale}.json"` | Catalog path template, relative to the project root. `{locale}` is replaced; a `.xlf` or `.xliff` extension selects XLIFF. |
| `xliff` | none | Also write an XLIFF export for translators: a path template like `catalogs`. |
| `extract` | on in builds | `true`, `false`, or `{ dirs, serve }`. Extraction scans `dirs` (default `["src"]`), writes the source catalog and updates every locale catalog (new messages are listed as untranslated, removed ones as obsolete). It runs at the start of a build; `serve: true` also runs it when the dev server starts. |
| `bake` | `false` | `true` or `{ onMissing, stripRuntime, htmlLang }`. `vite build` then emits one output per locale, `<outDir>/<locale>/`, with the translations compiled into the templates and no i18n runtime. Dev is never baked. |

The `bake` options:

| Option | Default | |
| --- | --- | --- |
| `onMissing` | `"error"` | What a locale without a translation does: `"error"` fails the build listing every missing message, `"warn"` warns and uses the source text, `"source"` silently uses the source text. |
| `stripRuntime` | `true` | Replace core's marker renderer (the `I18n` service and the ICU formatter) with a stub, since no markers are left. Set `false` if a dependency ships unbaked markers. |
| `htmlLang` | `true` | Set the `lang` attribute of `<html>` in each locale's `index.html`. |

The [i18n guide](../i18n.md) covers the markers, the catalog format, how extraction and baking work, and their limits.

## `gableServiceWorker()`

Builds the service worker for [`@gable/service-worker`](./service-worker.md) (install it too). It runs in `vite build` only.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { gable, gableServiceWorker } from "@gable/vite";

export default defineConfig({ plugins: [gable(), gableServiceWorker()] });
```

A production build then emits two more files into the output directory:

- `sw-manifest.json`, the asset manifest: `files` lists every emitted file, the public directory's included and source maps left out, as a path from the origin's root (`base` included). `hashes` gives each file's content hash (SHA-256, the first 16 hex digits). `version` hashes the worker's code and every file hash, so a change to any file, to `gable.sw.json` or to the worker's code makes a new release.
- `sw.js`, the worker: one classic script with the manifest built in, at a fixed URL so the browser sees each release as an update. Register it with `provideServiceWorker({ url: "/sw.js" })` (with `base` prefixed if it is not `/`).

| Option | Default | |
| --- | --- | --- |
| `config` | `"gable.sw.json"` | The default worker's config, relative to the project root. The build checks it, and that its navigation fallback is a prefetched file, and fails listing every problem. |
| `entry` | none | A custom worker module in place of the default worker. Its default export is `(self, manifest) => void` or a `defineWorker()` result, which the worker file calls with the manifest. |
| `fileName` | `"sw.js"` | The worker file's name. |
| `manifestFileName` | `"sw-manifest.json"` | The manifest's file name. |

The dev server gets neither file, and the app side registers only in a production build, so HMR is unaffected. `base` must be an absolute path. Not supported yet: a CDN or relative `base`, and `gableI18n()`'s baked per-locale outputs (the worker covers the top-level build only).

### Programmatic helpers

These are exported for scripts and tests: `extractProject(root, dirs)` and `extractFromSource(code, file)` return the messages found, `writeCatalogs(messages, options)` updates catalogs and returns a `LocaleReport` per locale, `readCatalogFile(path)` reads one, and `bakeSource(code, file, options)` and `bakeHtml(source, where, options)` bake a module or an HTML snippet.

Every exported symbol is documented in the [API reference](/docs/vite/api).
