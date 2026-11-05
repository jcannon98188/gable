---
id: TASK-1.5
title: Component model and hierarchical DI
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 04:58'
labels:
  - 'wayfinder:grilling'
dependencies: []
parent_task_id: TASK-1
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What is the class-based component model (metadata object instead of decorators, inputs/outputs, lifecycle) and the hierarchical dependency injection design (inject(), providers, injector scopes)?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:34
---
Resolved with the user.

**Component declaration**: plain class with `static meta` ({ selector, template, styles, imports, providers, host }); no base class, no decorators. Registry keyed by module URL + export name (stable HMR id with no compiler). Language service infers the template's `this` type from the enclosing class.
**Inputs/outputs**: field factories `input()`, `output()` (also an Observable), `model()` (two-way). No `inputs: []` arrays.
**Lifecycle**: no hook methods. Constructor and field initialisers run in an injection context; `effect()` for reactions, `onDestroy(cb)` for cleanup, `afterRender(cb)` post-render.
**DI**: tokens are classes or `InjectionToken<T>`; providers `useClass`/`useValue`/`useFactory`/`useExisting`; `inject(token, { optional, self, skipSelf, host })` only; default scope via `static scope = 'root'`, otherwise provided explicitly. No NgModules, no `@Injectable`.
**Injector tree**: single tree (root app -> route -> component). `meta.providers` creates a child injector. No `viewProviders`.
**Hosts**: gable's own hosts matched by `selector` (element/attribute/class), not custom elements; custom-element export is a possible later add-on.
**Imports**: explicit `meta.imports` per component; no global selector registry. Unknown element = clear dev-time error (runtime on first render, statically via the language service).
**Projection/queries**: slot-style outlets (named + default); signal-returning `viewChild`/`viewChildren`/`contentChild`.
**Host bindings/styles**: `meta.host` object for host attrs/classes/listeners; styles scoped by default, mechanism owned by the renderer, opt-out in `meta`.
**Scheduling**: no zone.js, no tree walk. Signal changes AND RxJS emissions (via the interop bridge into signal writes, so same flush, coalesced) schedule work; microtask flush, parents before children. Gable also exports an RxJS `SchedulerLike` (`renderScheduler`) aligned with the render flush. Plain-field mutation never triggers updates.
**Dynamic creation**: one public `createComponent(Class, { injector, inputs, host })` returning a handle (instance, `destroy()`, settable inputs); used by router, overlays, tests and bootstrap.
**Bootstrap**: `bootstrap(Root, { renderer, providers })`; renderer is an argument, never a global.

Left in the fog: error handling, testing utilities, devtools.
---

created: 2026-11-05 04:58
---
Amendment from Template syntax (user): pipes no longer exist, so meta.imports lists components, attribute directives and lazy() entries only.
---
<!-- COMMENTS:END -->
