---
id: TASK-100.6
title: 'Engine M5: regex, Date, collections, typed arrays, Proxy and BigInt'
status: To Do
assignee: []
created_date: '2026-11-07T22:36:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.5
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 207000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The remaining ECMAScript built-ins. Spec sections 2 and 6.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 regress is evaluated against test262 and pathological patterns and the adopt-or-build decision is recorded in an ADR; the regex engine sits behind a seam crate
- [ ] #2 RegExp, Date, Map, Set, WeakMap, WeakSet, WeakRef, FinalizationRegistry, ArrayBuffer, typed arrays, DataView, Proxy, Reflect, BigInt and single-agent SharedArrayBuffer and Atomics pass their test262 directories or are excluded with reasons (multi-agent tests are excluded as such)
<!-- AC:END -->
