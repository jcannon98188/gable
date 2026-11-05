---
id: TASK-1.11
title: Template language service v0 design
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 07:02'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.3
  - TASK-1.4
parent_task_id: TASK-1
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What is the v0 design of the TS language-service plugin: type-checking template expressions against the component class, completions, and diagnostics for unknown inputs/outputs/selectors and signal/observable misuse?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:46
---
From Template syntax: the language service reuses gable's expression parser. Expression language is minimal (reads, calls, literals, !, ??, pipes); no globals. Needs diagnostics for lazy() imports used outside @defer, and typing for the built-in async pipe.
---

created: 2026-11-05 04:53
---
Amendment from Template syntax (user): value expressions allow only property reads, zero-arg signal reads, literals, !, ??, pipes; no method calls. The language service must diagnose violations and provide quick-fix refactors that extract a computed signal (an enhanced view model) onto the component and rewrite the template to read it. Event-binding handler calls remain allowed.
---

created: 2026-11-05 04:58
---
Amendment from Template syntax (user): no pipes, no async pipe. Bare Observable/Promise references in value expressions unwrap to T | undefined with ?. path semantics; the language service must type them that way and offer a quick fix to extract formatting/derived values into computed view-model signals. Value expressions: property reads, zero-arg signal reads, literals, !, ??.
---

created: 2026-11-05 05:06
---
From Renderer abstraction: the renderer package ships a TypeScript element/property map (DOM derives from lib.dom) and declares its @defer trigger list; the language service reads both, so tag/property/trigger validity is renderer-defined, not core.
---

created: 2026-11-05 05:28
---
From HMR runtime: the language service should flag constructors in component/service classes and top-level signals/subjects (module-level state resets on edit).
---

created: 2026-11-05 05:38
---
From Dev server and bundler: Tailwind is first-class and cannot see runtime-assembled class names, so the language service should warn on non-literal class fragments in class bindings (e.g. 'bg-' + color()) and suggest full literal names or a lookup map. Also consider diagnosing tsconfig settings that break native class fields (useDefineForClassFields, target >= ES2022).
---

created: 2026-11-05 05:56
---
From Router design: no typed routes in v0; the language service only checks that routerLink/routerLinkActive are imported and that routerLink is a string. Route params arrive as input()s, already covered by input checks.
---

created: 2026-11-05 06:11
---
Resolved with the user.

**Architecture**: one analyzer core (gable's template parser, type-check block generator, rule catalogue, formatter) with thin wrappers: tsserver plugin, `gable-check` CLI (CI, runs next to `tsc --noEmit`), `gable-vscode` extension (bundles grammar and plugin so the workspace TS version is not needed), and a thin Prettier plugin. Volar and a patched tsc are out. Own template locator (default tag `html`, configurable); the archived decorator library is not a dependency.
**Type-checking**: one virtual check file per source file holding its type-check blocks, checked by the real TS checker. Plugin injects it by wrapping script snapshots; the CLI uses a custom CompilerHost. Positions map back through stored offsets; scaffolding errors suppressed by ignore markers. Always strict (no strictTemplates toggle); per-rule severity `off|warn|error` from one shared tsconfig plugin config. Advisory rules default to warn, correctness rules to error.
**Metadata**: derived from types and `meta.imports` only (no JSDoc, no registry). `static meta` must keep literal selector types. Inputs/outputs are InputSignal/ModelSignal/OutputRef members. Renderer metadata (element/property/event map, @defer triggers) comes from an explicit tsconfig `renderer` option (default `@gable/dom`); missing renderer is a config error.
**Scope typing**: `@for`, `@let`, `#ref`, `@if (x; as y)` become real TS locals; `@if/@else/@switch` become real statements so TS narrows. `@for` exposes `$index/$first/$last/$count/$even/$odd`. Bare Observable/Promise refs are `T | undefined` with `?.` semantics at every path step. `${}` holes are checked as plain TS expressions against the position's accepted type; never parsed inside.
**Rules (one catalogue, template rules and file rules)**: bare signal in value expression (fix: call it); call on non-signal; call with arguments in a value expression; calling an Observable/Promise (`user$()`); disallowed operators/globals (from the shared parser). Event/two-way: `(event)` resolves to `output()` or the renderer event map, `$event` typed, handler args checked, `[(model)]` needs a writable signal assignable to the model type, unknown names get did-you-mean. File rules: constructors in component/service classes, module-level signals/subjects, `lazy()` outside `@defer`, non-literal Tailwind class fragments, routerLink/routerLinkActive not imported or routerLink not a string, tsconfig breaking native class fields.
**Features in v0**: diagnostics, completions (members, tags, inputs/outputs, block keywords, defer triggers), quick info, go-to-definition, quick fixes, syntax highlighting, formatting.
**Quick fixes**: extract a `readonly name = computed(() => ...)` onto the component for component-level expressions; for loop-scoped expressions, a rows view-model refactor (computed `xs().map(...)` carrying derived fields) when the source is a plain signal read; otherwise report with no auto-fix.
**Highlighting**: standalone TextMate injection grammar for `html` templates (HTML, bindings, @blocks, interpolation, expressions); usable by VS Code, Shiki, others. Semantic tokens deferred.
**Formatting**: one opinionated formatter in the core, no gable-specific options (honours indent size, tabs/spaces, print width, base indent). Contract: pure `formatTemplate(source, options)` plus a CLI mode that rewrites only `html` template literals (files or stdin/stdout); deterministic and idempotent. tsserver formatting methods and the Prettier plugin wrap it. Prettier is the only official wrapper in v0; other formatters (Biome, oxfmt, dprint) ignore template bodies and run the gable CLI as a documented separate step; gable edits nothing outside `html` literals.
**Deferred**: rename, find references, semantic tokens, dprint WASM plugin, typed routes.
---

created: 2026-11-05 06:25
---
Amendment from Forms: Forms adds language service rules: [field] bound to a non-field; field/control value type mismatch; model key named state; uncalled signal read like state.errors; @for over rows() without track row.state.key; custom control with no recognised members (value model plus optional disabled/readonly/invalid/errors inputs and touched output). Forms metadata comes from types.
---

created: 2026-11-05 07:02
---
From Project scaffolding and starter template: the DOM renderer package is @gable/renderer-dom, so the default tsconfig renderer option is @gable/renderer-dom, not @gable/dom.
---
<!-- COMMENTS:END -->
