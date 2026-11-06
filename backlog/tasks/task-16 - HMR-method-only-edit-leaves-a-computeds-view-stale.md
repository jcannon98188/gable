---
id: TASK-16
title: 'HMR: method-only edit leaves a computed''s view stale'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:58'
updated_date: '2026-11-06 04:11'
labels:
  - bug
  - hmr
dependencies: []
priority: high
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by examples/hmr-benchmark. When a class method is edited and a computed has already called it, HMR patches the prototype only, so the DOM stays stale until one of that computed's signal dependencies changes (observed: view stayed at M0:1 after the edit and only showed M77:2 after a later click). A hot update should make dependents of the changed method re-evaluate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After a method-only hot edit, any computed or template binding that called the method re-evaluates and the DOM updates without needing another signal change, covered by a test using fixture.hotReplace
- [x] #2 State transfer and other HMR tests still pass; examples/hmr-benchmark method edit still reports no lost state
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Failing test in packages/testing/src/hmr.test.ts (computed + template binding call a method; hotReplace only the method; DOM must update).
2. In packages/core/src/hmr.ts, wrap each canonical-prototype method/getter at register time with a thin wrapper reading a per-entry version signal; patch() re-wraps replaced members and bumps the signal when members changed, so anything that called a method depends on its class's edit version.
3. Run core/testing/vite tests; re-run examples/hmr-benchmark (method edit state kept).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: patch() only swaps prototype members; a computed that called the method tracked nothing the edit touches. Fix (packages/core/src/hmr.ts): instrument() wraps each method/getter on a class's prototype (at registration, and lazily at component/service construction for adopted classes) with a wrapper that reads a per-class version signal; patch() re-wraps replaced members and bumps the signal when the member sources changed. hmr-source describe() takes an unwrap so classification still sees original source. Validation: new test 'method-only edits reach dependents' in packages/testing/src/hmr.test.ts failed before (A1 / A0 stayed) and passes; npx vitest run packages/core packages/testing packages/vite packages/renderer-dom: 349 passed. Benchmark (msedge, 500/2000) method edit rows all 'state kept: yes'.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Method-only hot edits now re-run computeds and bindings that called the method, via a per-class version signal read by instrumented prototype methods. Verified by a failing-then-passing fixture.hotReplace test, the full core/testing/vite/renderer-dom suites, and the hmr-benchmark (state kept in every row).
<!-- SECTION:FINAL_SUMMARY:END -->
