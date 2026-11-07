---
id: TASK-97.2
title: 'Site: live signals, computed and RxJS demo in the Framework section'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T20:29:00Z'
updated_date: '2026-11-07T20:43:00Z'
labels: []
dependencies: []
parent_task_id: TASK-97
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Signals, observables binding directly and simple template expressions are only described.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A live component shows signal, computed, effect-free derivation and an RxJS stream bound directly, updating as the visitor interacts
- [x] #2 A visual of what re-rendered (dependency tracking) is shown honestly from the runtime
- [x] #3 Shows the expression rules (what is allowed vs rejected) interactively
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Three demos under site/src/demos/signals (signals+computed with MutationObserver flash, RxJS ticker/search with subscription count, expression playground on real parser/runtime). 2. Wrap each in an ErrorBoundary; mount from framework.ts. 3. Tests, browser check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added signals-demo, rxjs-demo, expressions-demo and framework-demos (each in an ErrorBoundary) under site/src/demos/signals, mounted from framework.ts. Signals: real computed run counts and MutationObserver-driven flash/paint counts (a+2 re-runs parity without repainting). RxJS: bare tick$/results$ bindings, debounce+switchMap, subscription count 2 -> 0 on removal and back. Expressions: real parseExpression from @gable/core/tooling for errors, rendered through createComponent against a sample; rewrite buttons are hand-picked. Verified in a browser on a vite dev server and with 9 vitest tests; npm run check for my files is clean (other agents' in-flight errors remain in demos/data, demos/router, hmr-demo).
<!-- SECTION:FINAL_SUMMARY:END -->
