---
id: TASK-1.13
title: Error handling
status: Done
assignee:
  - '@Jason'
created_date: '2026-11-05 06:13'
updated_date: '2026-11-05 06:33'
labels:
  - 'wayfinder:grilling'
dependencies: []
parent_task_id: TASK-1
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Several decisions route failures to "the app error handler" (observable and promise binding, toSignal/toObservable, HMR rollback). What is that handler: its Token and default behaviour, how errors in setup, effects, event handlers and template evaluation are caught and attributed to a component, whether there are error boundaries, and what the dev-time error overlay can hook into?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 06:33
---
Decision. (1) `ErrorHandler` is a Token provided by the root injector; `handleError(error, context)`. Default logs to console.error with the context and swallows; apps replace it via bootstrap providers. (2) Every report carries `ErrorContext = { source, component?, injector, detail? }`, source one of setup|effect|event|binding|subscription|lazy|router|hmr; attribution comes from the owning scope (already tracked for interop bridges); the error is never wrapped. (3) No error boundaries in v0 (fog); the Token plus attribution is the seam for them later. (4) Effect throws: reported, effect stays alive and re-runs on next dependency change. (5) Event handler errors: caught at the listener, reported, never rethrown; rejected returned Promises reported; returned Observables ignored. (6) Binding evaluation throws: keep last good value (nothing if none), report once per failure episode, reset on next clean evaluation. (7) Setup throws: reported (source setup), scope disposed (earlier subscriptions/effects torn down), host renders empty, siblings continue; root setup failure rejects bootstrap(); during HMR it is the rollback path instead. (8) No special overlay hook: overlay/devtools/Sentry adapters are providers decorating ErrorHandler (wrap previous, forward, display); reports are plain data; HMR clears overlay after a successful update; overlay is dev-only. (9) A throwing handler is caught, falls back to console.error for both errors, no recursion. (10) Test harness handler collects reports and rethrows from flush/settle so unexpected errors fail tests by default; harness API belongs to the Testing story ticket. Glossary term added: Error handler.
---
<!-- COMMENTS:END -->
