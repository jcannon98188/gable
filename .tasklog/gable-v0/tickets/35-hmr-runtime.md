---
kind: ticket
title: HMR runtime
status: resolved
blocked_by: [25, 28]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.14 - HMR-runtime.md
assignee:
  - '@jason'
ordinal: 35000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Every prototype scenario passes through hotReplace
- [x] #2 A failing update leaves the app unchanged
- [x] #3 State transfer, cascade and rollback behave as specified

## Answer

HMR runtime with all nine prototype scenarios via fixture.hotReplace; merged.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The dev-only runtime: registry keyed by module URL and export name, canonical-class patching, re-setup on a new instance with State transfer by name and kind, service cascade, atomic transactions with rollback, hmr modes (reset, reload, ignore) at class and module level, hotState, and fixture.hotReplace. Seed the tests from the nine scenarios of the HMR prototype on the prototype/hmr-spike branch (template edit, computed edit, method-only edit, rename, kind change, service cascade, one save with two files, broken file, reset).
