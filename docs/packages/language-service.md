# @gable/language-service

The Gable template analyzer. It type-checks the `html` templates in your components against their classes: unknown members, a signal read without `()`, a wrong event name, a binding of the wrong type, accessibility mistakes, missing translations and more. It ships two front ends over one analyzer: a `tsserver` plugin that reports the same problems in your editor, and the `gable-check` command for CI.

It runs on the TypeScript compiler, so it is a Node tool. There is no live demo on this page: the analyzer needs a TypeScript program and the file system, which a browser page does not have.

## Install

```
npm install -D @gable/language-service typescript
```

The starter from [create-gable](./create-gable.md) has this set up. For an existing app see [Manual setup](../manual-setup.md).

## Enable it

Add an entry to `compilerOptions.plugins` in your `tsconfig.json`. The editor and `gable-check` both read it.

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "@gable/language-service", "renderer": "@gable/renderer-dom" }]
  }
}
```

In VS Code, install the `gable.gable-vscode` extension and point the editor at the workspace TypeScript with `"typescript.tsdk": "node_modules/typescript/lib"`, as in [Manual setup](../manual-setup.md).

### Plugin options

| Option | Default | |
| --- | --- | --- |
| `templateTag` | `"html"` | The tag of the template literals to check. Must be an identifier. |
| `rules` | each rule's own default | An object of rule name to `"off"`, `"warn"` or `"error"`. An unknown rule name or severity is a configuration error. |
| `i18n` | off | Where the translation catalogs are, which turns on `i18n-missing-translation`. Same shape as the options of `gableI18n` in [`@gable/vite`](./vite.md): `sourceLocale`, `locales`, `catalogs`. |

```json
{
  "name": "@gable/language-service",
  "rules": { "a11y-heading-order": "off", "a11y-img-alt": "error" },
  "i18n": { "sourceLocale": "en", "locales": ["fr", "de"], "catalogs": "src/locales/messages.{locale}.json" }
}
```

A `renderer` key, as in the starter's tsconfig, names the renderer package your app bootstraps with.

### Rules

Rules that are errors by default catch things that break at runtime: `template-syntax`, `expression-syntax`, `unknown-member`, `type-mismatch`, `bare-signal`, `call-non-signal`, `call-observable`, `model-not-writable`, `model-type-mismatch`, `unknown-event`, and the checks on component metadata, fields, router links and stores. Advisory rules are warnings: the `a11y-*` rules, `module-level-state`, `class-fragment`, `rows-track-key`, `i18n-empty` and `i18n-missing-translation`. `i18n-unmarked-text` is off until you ask for it. The full table of severities is the exported `RULES` constant.

- The accessibility rules are described in the [accessibility guide](../accessibility.md).
- The `i18n-*` rules are described in the [i18n guide](../i18n.md).

## `gable-check`

```
Usage: gable-check [--project <tsconfig.json | dir>] [--format text|json] [--fix]

Type-checks html templates against their component classes. --fix first applies
the quick fixes (extracting computed view-model signals, calling bare signals).
Exits 1 when any
diagnostic has severity "error", 2 on a usage or configuration problem.
Rule severities (off | warn | error) come from the "@gable/language-service"
entry of compilerOptions.plugins in the tsconfig.
```

| Flag | Meaning |
| --- | --- |
| `--project <tsconfig.json or dir>`, `-p` | The project to check. Default: the current directory. |
| `--format text\|json` | `text` (default) prints `file:line:column severity gable/rule message` per diagnostic and a count. `json` prints the diagnostics as a JSON array. |
| `--fix` | Apply the quick fixes first, listing each fixed file on stderr, then report what is left. The fixes extract an expression the template language does not allow into a `computed` view-model signal on the component, and add the missing `()` to a bare signal. |
| `-h`, `--help` | Print the usage. |

The exit code is 0 when there are no errors (warnings alone do not fail), 1 when any diagnostic has severity `error`, and 2 for a usage or configuration problem, such as an unknown rule name in the plugin entry.

The starter wires it into its check script:

```json
"check": "tsc --noEmit && gable-check"
```

## From code

```ts
import { analyzeProject, checkTemplateSyntax } from "@gable/language-service";

const { diagnostics, configErrors } = analyzeProject("./tsconfig.json");
const quick = checkTemplateSyntax("card.ts", sourceText); // syntax only, no type check
```

`analyzeProject` runs the full analysis and returns a `Diagnostic` for each problem (file, line, column, rule, severity, message). `checkTemplateSyntax` reports only `template-syntax` and `expression-syntax` problems for one file, in milliseconds; the Designer uses it on every save. `runCheck` is the `gable-check` implementation over a small I/O seam, and `RULES` is the rule catalogue.

Every exported symbol is documented in the [API reference](/docs/language-service/api).
