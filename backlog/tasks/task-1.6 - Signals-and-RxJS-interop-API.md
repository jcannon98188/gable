---
id: TASK-1.6
title: Signals and RxJS interop API
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 05:45'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.1
parent_task_id: TASK-1
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What is the exact interop surface: signal/observable bridges, direct binding of either in templates, subscription ownership and cleanup, and how router/HTTP/forms/events expose both shapes?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:34
---
From Component model and hierarchical DI: scheduling must cover RxJS. Observable emissions reaching templates/effects go through this bridge into signal writes (same coalesced microtask flush), and gable exports an RxJS SchedulerLike (renderScheduler) aligned with the render flush. output() is also an Observable.
---

created: 2026-11-05 04:46
---
From Template syntax: the built-in async pipe (Observables and Promises, always available) is a template-level user of this bridge; emissions must schedule through the one coalesced flush.
---

created: 2026-11-05 04:58
---
Amendment from Template syntax (user): there is no async pipe. Templates bind bare Observable/Promise references directly; the runtime subscribes via this bridge, yields undefined until first emission, applies ?. semantics through property paths, unsubscribes on destroy, resubscribes when the reference changes, sends errors to the app error handler, and keeps the last value after completion. Promises behave as a single-emission Observable.
---

created: 2026-11-05 05:45
---
Resolution (grilled with user, all eight recommendations accepted):
1. Bridges are `toSignal(source, options?)` (Observable or Promise -> read-only Signal) and `toObservable(signal)`, exported from gable (or a `gable/rxjs` subpath); core signals code never imports RxJS (peer dependency).
2. Scope-owned: bridges (and effect) must be called in setup (an injection context); the subscription is torn down on scope destroy. Outside a context they throw unless `{ scope }` or `{ manual: true }` is passed. HMR: old instance scope disposal unsubscribes, the re-set-up instance resubscribes.
3. `toSignal` is `T | undefined` by default; `{ initialValue }` narrows; no `requireSync` in v0. Promises are single-emission Observables.
4. Errors go to the app error handler (same path as templates); the signal never throws and keeps its last value; completion keeps the last value. Users use catchError/materialize upstream to see errors in the view.
5. `toObservable` is flush-aligned: emits current value on subscribe, then the settled value after each coalesced flush; intermediate writes are not seen. Per-write streams use output()/Subjects.
6. Dual-shape convention for router/forms/HTTP/events: state is a Signal; events and async results are Observables; a `$` suffix marks the Observable twin where a value needs both (`value`/`value$`). Later tickets are bound by this.
7. `renderScheduler` is an opt-in RxJS SchedulerLike tied to the render flush (for observeOn/auditTime); toSignal writes never apply it implicitly; the test renderer flushes it deterministically.
8. Template binding of bare Observable/Promise uses the same machinery as toSignal, owned by the binding scope, resubscribes when the reference changes; the language service types it `T | undefined`; no new syntax.
Implied by earlier decisions: output() is an Observable, model() is a writable signal.
---
<!-- COMMENTS:END -->
