# @gable/vite

The Vite plugins for Gable. `gable()` sets up the build and dev server for Gable's native-class-field components, and `gableI18n()` extracts translation messages and can bake one build per locale. Vite 8 or newer is required, and `@gable/core` is a peer dependency.

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

### Programmatic helpers

These are exported for scripts and tests: `extractProject(root, dirs)` and `extractFromSource(code, file)` return the messages found, `writeCatalogs(messages, options)` updates catalogs and returns a `LocaleReport` per locale, `readCatalogFile(path)` reads one, and `bakeSource(code, file, options)` and `bakeHtml(source, where, options)` bake a module or an HTML snippet.

Every exported symbol is documented in the [API reference](/docs/vite/api).
