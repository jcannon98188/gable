---
kind: ticket
title: "Site: live signals, computed and RxJS demo in the Framework section"
status: resolved
tags:
  - parent-97
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-97.2 - Site-live-signals-computed-and-RxJS-demo-in-the-Framework-section.md
assignee:
  - '@claude'
ordinal: 182000
---

## Question

Signals, observables binding directly and simple template expressions are only described.

## Acceptance criteria

- [x] #1 A live component shows signal, computed, effect-free derivation and an RxJS stream bound directly, updating as the visitor interacts
- [x] #2 A visual of what re-rendered (dependency tracking) is shown honestly from the runtime
- [x] #3 Shows the expression rules (what is allowed vs rejected) interactively

## Implementation plan

1. Three demos under site/src/demos/signals (signals+computed with MutationObserver flash, RxJS ticker/search with subscription count, expression playground on real parser/runtime). 2. Wrap each in an ErrorBoundary; mount from framework.ts. 3. Tests, browser check.

## Answer

Added signals-demo, rxjs-demo, expressions-demo and framework-demos (each in an ErrorBoundary) under site/src/demos/signals, mounted from framework.ts. Signals: real computed run counts and MutationObserver-driven flash/paint counts (a+2 re-runs parity without repainting). RxJS: bare tick$/results$ bindings, debounce+switchMap, subscription count 2 -> 0 on removal and back. Expressions: real parseExpression from @gablejs/core/tooling for errors, rendered through createComponent against a sample; rewrite buttons are hand-picked. Verified in a browser on a vite dev server and with 9 vitest tests; npm run check for my files is clean (other agents' in-flight errors remain in demos/data, demos/router, hmr-demo).
