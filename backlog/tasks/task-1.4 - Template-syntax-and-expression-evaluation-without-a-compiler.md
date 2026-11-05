---
id: TASK-1.4
title: Template syntax and expression evaluation without a compiler
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 04:53'
labels:
  - 'wayfinder:grilling'
dependencies: []
parent_task_id: TASK-1
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What is gable's template syntax (control flow, bindings, events, interpolation) and how are template expressions evaluated at runtime without a framework compiler: own expression parser vs Function/eval, CSP implications, and caching of parsed templates?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:46
---
Resolved with the user.

**Template tag**: `` html`...` ``. Static structure is parsed once per call site (strings-array identity) and cached. `${}` holes are only plain JS values in attribute-value and child positions (e.g. fragments); all reactive logic is in expressions inside the template text. Parsing is lazy on first render; HMR invalidates by call-site identity (new module = new strings arrays).
**Expression language**: gable's own parser plus a tree-walking interpreter. No `eval`/`new Function`, so strict CSP works. The language service reuses the parser.
**What expressions allow (no compute in templates; compute lives in `computed` signals or methods)**: property and signal reads (`a.b`, `a?.b`, `count()`), calls with reference or literal args, literals (strings, numbers, booleans, null), `!`, `??` as a default for undefined, and pipes (formatting, not computation). Not allowed: binary operators, ternary, arrow functions, object/array literals, assignments (outside `[(model)]` two-way and event-handler calls). No globals at all (no `Math`, `JSON`, `window`, ...).
**Scope**: names resolve against the component instance, then template-local variables (loop vars, `@let`, `#ref`). Signals are read by calling them; there is no implicit unwrap.
**Control flow**: block syntax only: `@if/@else`, `@for (x of xs(); track x.id)/@empty` (`track` required), `@switch`, `@let`. No `*ngIf`, microsyntax, or `<ng-template>`. Reusable fragments are `${}`-passed template values or small components.
**Bindings**: `[prop]`, `[attr.x]`, `[class.x]`, `[style.x]`, `(event)="handler($event)"`, `[(model)]="sig"`, `#ref`. Attribute directives exist (selector-matched, in `meta.imports`, can inject their host). No structural directives.
**Pipes**: instantiated per binding in an injection context; pure by default (memoized), opt out with `static pure = false`. Built-in `async` pipe is always available (no import): binds Observables and Promises directly (`user$ | async`, `@if (user$ | async; as user)`), subscribes on bind, unsubscribes on destroy, resubscribes if the Observable changes, yields `undefined` before first emission (`async:initial` supplies a starting value), errors go to the app error handler. It uses the same observable-to-signal bridge as the interop API, so emissions ride the coalesced flush.
**`@defer` is in v0**: with `@placeholder`, `@loading`, `@error`. Core triggers `when <expr>`, `on idle`, `on timer(ms)`; renderer-specific triggers (`on viewport`, `on interaction`, `on hover` for DOM) are supplied by the renderer. Deferrable dependencies are explicit: `lazy(() => import('./chart.js'), 'Chart')` in `meta.imports`, usable only inside `@defer` (otherwise a dev-time error, also reported by the language service).
---

created: 2026-11-05 04:53
---
Amendment (user): outside event bindings, templates contain no function calls except signal reads. This supersedes "calls with reference or literal args" in the expression rules above.

**Allowed in value expressions** (bindings, interpolation, control-flow conditions, `@for` sources): property reads (`a.b`, `a?.b`), zero-argument signal reads (`count()`), literals, `!`, `??`, and pipes (pipe arguments are literals/references). No method calls, no calls with arguments.
**Event bindings** `(event)="handler(arg)"` may still call handlers; arguments are references, literals or `$event`.
**Where computed values live**: enhanced view models, i.e. computed signals that already include the derived value (e.g. a computed list of rows carrying `isSelected`, `label`), instead of fetching values through methods in the template.
**Language service role**: diagnostics flag a disallowed call or operator in a value expression and offer quick-fix refactors that extract a computed signal (view-model field) on the component and replace the expression with its read. This is a v0 language-service requirement, not just an interpreter restriction.
---
<!-- COMMENTS:END -->
