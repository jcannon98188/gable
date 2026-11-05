# Template language services for tagged-template-literal templates

Ticket: TASK-1.3. Researched 2026-11-04. All sources are first-party (official docs, upstream repos). Items marked **[inference]** are my conclusions, not source statements. Items marked **[unverified]** could not be confirmed from a primary source in this pass.

Note: GLOSSARY.md was not present in this worktree, so gable terms are used loosely.

## Summary

1. A TypeScript language-service plugin can add completions, diagnostics, quick info and more inside tagged template literals. It runs in tsserver only. `tsc` never loads it.
2. ts-lit-plugin / lit-analyzer is the closest prior art: one analyzer core, wrapped as a tsserver plugin (editor) and a CLI (CI).
3. Angular type-checks templates by generating TypeScript ("type-check blocks"), running the real TS checker over it, and mapping errors back to template offsets. This is the strongest approach for expression type-checking against a component class.
4. CI type-checking is not free for a plugin. Options are a separate CLI that reuses the analyzer (lit-analyzer model), or a patched `tsc` driver (Volar's `runTsc` model).
5. Recommended v0 architecture: a gable analyzer core that parses a template and emits a virtual TS "type-check block" per template; a thin tsserver plugin and a thin CLI both call it.

## 1. What a TS language-service plugin can and cannot do

Source: TypeScript wiki, "Writing a Language Service Plugin" (https://github.com/microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin, fetched 2026-11-04).

- Plugins change only the editing experience. The page's own examples include "adding errors or completions inside string literals for a custom templating language".
- Plugins cannot add syntax, change emit, or change which errors `tsc` reports. They "aren't loaded during normal commandline typechecking or emitting".
- Pattern: `create(info)` receives the existing language service and returns a wrapper (decorator) that forwards everything and overrides chosen methods.
- Enabled via `compilerOptions.plugins` in tsconfig; extra entry properties arrive in `info.config`.
- Use the `typescript` module the server passes in, not your own import.
- In VS Code the workspace TypeScript version must be selected for the plugin to load.

### Helper library for template literals

Source: https://github.com/Microsoft/typescript-template-language-service-decorator (fetched 2026-11-04).

- `decorateWithTemplateLanguageService(typescript, languageService, project, templateService, options)`, with `options.tags` restricting which tagged templates are handled.
- You implement a `TemplateLanguageService` that works on the template's contents. Positions are relative to the template body, not the file.
- The README only documents `getCompletionsAtPosition` and does not document how `${}` substitutions are handled **[unverified]**.
- The repository is archived and read-only as of 2026-03-28. Treat as reference, or vendor/replace it rather than depend on it.
- The README names typescript-styled-plugin and typescript-lit-html-plugin as users.

## 2. ts-lit-plugin / lit-analyzer

Sources: https://github.com/runem/lit-analyzer ; package READMEs at https://raw.githubusercontent.com/runem/lit-analyzer/master/packages/lit-analyzer/README.md and .../packages/ts-lit-plugin/README.md (fetched 2026-11-04).

- Monorepo of three packages: `lit-analyzer` (CLI and analysis core), `ts-lit-plugin` (tsserver plugin), `vscode-lit-plugin` (VS Code extension).
- Checks: HTML validity, custom-element tag/import resolution, attribute/property/event/slot names, binding types against TS types (`no-incompatible-type-binding`, `no-nullable-attribute-binding`, etc.), and CSS in `css` templates via vscode-css-languageservice.
- Element metadata comes from web-component-analyzer plus JSDoc tags (`@attr`, `@prop`, `@fires`, `@slot`). Library elements may need `HTMLElementTagNameMap` declarations.
- Tag config: `htmlTemplateTags` (default `["html","raw"]`), `cssTemplateTags` (default `["css"]`). Also `strict`, `rules`, `disable`, `globalTags/Attributes/Events`, `customHtmlData`, `maxProjectImportDepth`, `maxNodeModuleImportDepth`.
- CI: the plugin README does not say `tsc` runs the checks; it points to the `lit-analyzer` CLI for command-line use. CLI flags include `--strict`, `--rules.<name> off|warn|error`, `--format`, `--maxWarnings`, `--failFast`, `--quiet`.
- The READMEs state binding checks work better in TypeScript than JavaScript.
- Lit templates have no expression language of their own (`${}` is plain TS), so lit-analyzer checks binding *targets* and types rather than parsing an expression grammar.
- Which `LanguageService` methods ts-lit-plugin overrides: **[unverified]** (source file fetch failed).

Takeaway **[inference]**: split analyzer from plugin, and ship a CLI on the same analyzer for CI.

## 3. Angular language service and template type-checking

Sources (all fetched 2026-11-04):
- https://angular.dev/tools/language-service
- https://github.com/angular/angular/blob/main/packages/compiler-cli/src/ngtsc/typecheck/README.md
- https://github.com/angular/angular/blob/main/packages/language-service/src/ts_plugin.ts
- https://angular.dev/tools/cli/template-typecheck

How it type-checks:
- Each component template is turned into a **type-check block (TCB)**: a function whose `this` is the component instance. TCBs are never emitted or run; they exist so TypeScript can check bindings, directives and references.
- Each source file gets a synthetic "typecheck" file holding its components' TCBs, applied to the `ts.Program` through a program strategy. Generic directives are inferred via generated "type constructors"; structural directives narrow via guard hints.
- Generated code carries comments recording template offsets and template IDs. A TS error inside a TCB is traced back to the template node. Ignore markers suppress errors from generated scaffolding.
- The `TemplateTypeChecker` generates TCBs lazily and exposes `Symbol`s mapping template nodes to TCB positions; the language service asks TypeScript about those positions for go-to-definition, quick info, completions.

How it ships:
- The tsserver plugin overrides a wide set of `LanguageService` methods: the four diagnostics getters, quick info, definitions, references, signature help, rename, completions (+ entry details), semantic classifications, code fixes, refactors, linked editing. For TS files, diagnostics are merged with TS's; other features try TS then Angular. It also adds custom methods such as `getTcb`.
- Inline templates in TS files are supported (the plugin source notes "Only handle inline templates in TypeScript files"); how inline templates are located is not shown in the fetched excerpt **[unverified]**.
- CI uses the compiler, not the plugin: the compiler performs template checks (modes controlled by `strictTemplates`; strict by default per the current docs). The docs page does not name `ngc` or say when checks run **[unverified]**. This is the ngc-style compiler dependency gable's map forbids, so gable must supply its own CLI.
- Angular's compiler and language service are tied to Angular's compile-time metadata. Gable cannot reuse them directly **[inference]**.

## 4. Volar / embedded-language architecture

Sources (all fetched 2026-11-04):
- https://github.com/volarjs/volar.js
- https://raw.githubusercontent.com/volarjs/volar.js/master/packages/language-core/lib/types.ts
- https://raw.githubusercontent.com/volarjs/volar.js/master/packages/typescript/lib/quickstart/createLanguageServicePlugin.ts
- https://raw.githubusercontent.com/volarjs/volar.js/master/packages/typescript/lib/quickstart/runTsc.ts
- https://raw.githubusercontent.com/vuejs/language-tools/master/packages/tsc/index.ts

- Core model: a `LanguagePlugin` turns a source script into a `VirtualCode` (`id`, `languageId`, `snapshot`, `mappings`, optional nested `embeddedCodes`). `CodeMapping`s carry per-region feature flags (`verification`, `completion`, `semantic`, `navigation`, `structure`, `format`), so you can say "diagnose here, but don't offer completion there".
- `createLanguageServicePlugin` wraps tsserver's language service in a proxy so the virtual code participates in TS features, and registers extra file extensions via `getExternalFiles`.
- `runTsc` patches the TypeScript compiler source in memory so `createProgram` is routed through `proxyCreateProgram` with the language plugins. This is how `vue-tsc` gives CI type-checking: it calls `runTsc` with the `.vue` extension and the Vue language plugin.
- Fit for gable **[inference]**: Volar's CI route is built around *extra file extensions* (e.g. `.vue`). Gable templates live inside `.ts` files as tagged literals, so there is no distinct file to register. Whether Volar's `VirtualCode`/`runTsc` can map embedded regions inside an ordinary `.ts` file was not established from sources **[unverified]**. It adds a large dependency and a patched `tsc`, which is a heavy v0 commitment.

## 5. Limits, consolidated

| Concern | Finding | Source |
|---|---|---|
| Runs under `tsc` | No. tsserver only. | TS wiki |
| Add syntax / change emit | No | TS wiki |
| Editor coverage | Only editors that load tsserver plugins (VS Code needs workspace TS version) | TS wiki |
| CI | Needs a separate CLI (lit-analyzer) or compiler (Angular) or patched tsc (Volar) | READMEs above |
| Expression type-checking | Requires generating TS and asking the real checker (Angular TCB); positions must map back | Angular typecheck README |
| Helper library | `typescript-template-language-service-decorator` archived 2026-03-28 | its README |

## 6. Recommended architecture for gable v0 [inference, from the above]

1. **Analyzer core (pure library, no tsserver dependency).** Input: source file, tagged-template nodes, the component class. Reuses the runtime's template parser so editor and runtime agree on syntax. Output: per-template parse diagnostics plus a **virtual TS type-check block** (Angular TCB style): a function whose `this` is the component class, containing each binding expression as a TS expression, with a recorded offset map back to the template text. Scope variables (loop/let bindings) become TS locals so TS narrows them.
2. **Type-checking via the real checker.** Add the generated block as a virtual source text in the program (plugin-side: wrap the host's script snapshots; or use a side `ts.Program`), query diagnostics, and remap to template positions with ignore markers on scaffolding. This yields expression type errors and member completion from TS itself.
3. **tsserver plugin as a thin wrapper**, decorator style: override completions, semantic diagnostics, quick info, definition (rename later). Locate templates by tag name (configurable, like ts-lit-plugin's `htmlTemplateTags`). Handle `${}` substitutions explicitly, since the decorator library does not document them.
4. **CI path: a `gable-check` CLI over the same core**, same diagnostic format (lit-analyzer model). It depends on no gable compiler; run it next to `tsc --noEmit`. Defer a patched-`tsc` driver (Volar `runTsc`) unless the CLI proves insufficient.
5. **Defer Volar**: its value is strongest for separate-file formats and multi-language embedding; evaluate only if gable later adds external template files.
6. **Open questions for TASK-1.11**: how substitutions in template literals are exposed to the analyzer; how to declare component-element metadata (JSDoc vs a type-level registry like `HTMLElementTagNameMap`); how to type structural constructs' scope variables; whether to vendor the decorator library.
