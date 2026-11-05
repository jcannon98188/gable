---
id: TASK-1.15
title: Forms
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 06:13'
updated_date: '2026-11-05 06:58'
labels:
  - 'wayfinder:grilling'
dependencies: []
parent_task_id: TASK-1
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What is gable's forms model: signal-based form state and validation, how it binds to inputs through `[(model)]` and renderer-provided controls, how it interops with RxJS for async validation, and what the language service must type-check?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 06:25
---
Resolved with the user (grilled; every recommendation accepted).

**Package**: forms is a separate optional entry point (`gable/forms` or `@gable/forms`, final name with Public package layout), built only on public core APIs (signal, computed, effect, toSignal). Renderer-specific control bindings ship with each renderer.
**Shape**: model-first. `form(model, schema?)` derives a typed field tree from a writable model signal. Every node is a WritableSignal: `form()` is the whole value, `form.email()` just that field; reads are fine-grained (child reads are computeds over the parent slice, `===` equality keeps siblings quiet) and child writes update the parent immutably. The root model is canonical. `[(model)]="form.email"` works directly.
**State namespace**: per-field state lives under one reserved `state` property (`form.email.state.errors()`, `touched`, `dirty`, `pending`, `valid`, `disabled`, `readonly`, `submitting`, `submitted`, `key`); `state` is the only forbidden model key (dev runtime throws, language service flags it).
**Errors**: validators are pure functions returning nothing or an error object `{ kind, message?, ...data }`; `state.errors()` is an array of them (own), `state.allErrors()` is `{ path, error }[]` for the subtree. No display policy in forms; views combine touched/submitted with errors in a view model.
**Validation**: a schema callback with typed paths and free-function rules: `required`, `minLength`, `maxLength`, `min`, `max`, `pattern`, `email`, `requiredTrue`, `validate(path, fn)`. Validators run in computeds, so cross-field reads are reactive. Schemas compose with `apply(path, subSchema)`. `required` treats null, undefined, '' and [] as empty.
**Async validation**: `validateAsync(path, value$ => Observable<errors | null>)`, plain RxJS (debounce/switchMap/retry are operators). Runs only when sync validators pass. `state.pending()` until it emits. A stream error goes to the app error handler, clears pending and adds `{ kind: 'asyncFailed' }`.
**Conditional state**: `disabled`, `readonly`, `applyWhen(path, cond, subSchema)`; no `hidden` (use `@if`). Disabled fields are skipped by validation and excluded from parent validity; values are never stripped from the model.
**Touched/dirty/reset**: touched on first blur; dirty is a computed comparison with a baseline (the initial model value); `form.reset(value?)` restores or rebaselines and clears touched; parent state aggregates descendants.
**Submit**: `form.submit(action)`; marks everything touched, runs only if valid and not pending, tracks `state.submitting()`. The action (Promise or Observable) may resolve to `{ path: ErrorObject[] }` server errors, attached as ordinary errors and cleared when that field next changes. Failures go to the app error handler.
**Arrays**: array fields expose `rows()` (signal of row fields with stable generated keys) and `push`, `insert`, `remove`, `move`; templates use `@for (row of form.items.rows(); track row.state.key)`. Row state follows the key.
**Binding**: the renderer ships a `[field]` directive (DOM: `<input [field]="form.email">`) which maps value by element type (text string; number `number | null`, empty is null; checkbox boolean; radio/select option value; date string), writes back, marks touched on blur, applies disabled and aria-invalid. `[(model)]` on a native input stays value-only for plain signals.
**Custom controls**: structural convention, no interface: a component with `value = model<T>()` works with `[field]`; optional `disabled`, `readonly`, `invalid`, `errors` inputs and a `touched` output are filled/listened to.
**Observable twins**: only `value$` on every field, `state.errors$`, and `submit$`; all flush-aligned. Other state is bridged with `toObservable`.
**Lifecycle**: `form()` is called in setup and is scope-owned (async subscriptions and effects torn down on destroy; outside setup it throws unless `{ scope }`). The schema function runs once in an injection context (validators can `inject()` while building); validator bodies run reactively with no injection context.
**HMR**: a `form` field is its own state-transfer kind: model value, touched flags and dirty baseline carry over by path; the schema is re-read from new code and re-run; removed paths drop, new paths start fresh; array rows keep state by key.
**Language service rules added**: `[field]` bound to a non-field; field/control value type mismatch; model key named `state`; uncalled signal read such as `state.errors`; `@for` over `rows()` without `track row.state.key`; custom control with no recognised members.
**Out of v0**: template-driven forms, a form builder DSL, schema-from-JSON/dynamic generation, built-in i18n of error messages, file inputs, wizard/multi-step orchestration.
---

created: 2026-11-05 06:58
---
From Public package layout and versioning: forms ships as the @gable/core/forms entry point.
---
<!-- COMMENTS:END -->
