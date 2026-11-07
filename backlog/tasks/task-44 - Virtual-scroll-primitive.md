---
id: TASK-44
title: Virtual scroll primitive
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:30:00Z'
updated_date: '2026-11-07T03:48:00Z'
labels:
  - ui
  - performance
  - ready-for-agent
dependencies:
  - TASK-25
priority: medium
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A virtual-scroll component for large lists and tables: fixed and variable item heights, buffer size, scroll-to-index, sticky headers, keyboard and screen-reader semantics (aria-rowcount, aria-setsize), and compatibility with @for-style item rendering and track keys. Consider TanStack Virtual's framework-agnostic core. Benchmark against the js-framework-benchmark rows case.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Virtual scroll renders only visible items plus buffer for fixed and variable heights, with scroll-to-index
- [x] #2 Accessible semantics and tests; benchmark result recorded in docs/performance.md
- [x] #3 Used by a gable-ui Table or Combobox example
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Engine (virtual-core.ts): prefix sums, binary search, measured sizes by key, sticky, scroll-to offsets. 2. DOM/renderer binding useVirtualizer (virtual.ts): scroll, ResizeObserver/MutationObserver measuring, scrollToIndex re-aim, keyboard, aria. 3. gable-ui ui-virtual-list and ui-virtual-table plus registry-meta. 4. Tests (in-memory + jsdom with mocked layout). 5. examples/virtual-benchmark and gallery virtual.html demo. 6. Docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: own engine instead of @tanstack/virtual-core (not installed; its class with subscribe/notify and per-change item rebuild sits badly between scroll events and signals, and adds a dependency to code gable-ui copies). Gotchas: templates cannot index arrays or call functions, so useVirtualizer exposes rows() with a props bag per item, and consumers map data in with a computed; rows rendered before the MutationObserver existed need an attribute observer on data-index because [uiProps] applies attributes after insertion. Files: packages/ui-primitives/src/virtual-core.ts, virtual.ts (+tests virtual.test.ts, virtual.dom.test.ts), packages/ui/src/components/virtual-list.ts, virtual-table.ts (+virtual.test.ts), examples/virtual-benchmark, examples/ui-gallery/virtual.html + src/virtual-demo*.ts (additive; needs pack:local to resolve the new @gable/ui exports, demo test verified with a temporary source-alias config). Benchmark in docs/performance.md: 100,000 rows create 9,380 ms plain vs 43.5 ms virtual, sweep frame 36.7 vs 16.7 ms. Verification: npx vitest run packages/ui-primitives packages/ui (188 passed); tsc -p tsconfig.build.json clean for both packages. Not done: horizontal virtualisation, variable-height benchmark, virtual Combobox (ui-virtual-table is the AC3 example).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a virtual scroll primitive (createVirtualizer engine and useVirtualizer binding) to @gable/ui-primitives with fixed and measured variable heights, overscan, scrollToIndex with re-aim, sticky headers, keyboard roving and aria-setsize/posinset or aria-rowcount/rowindex semantics, keyed by @for track keys. gable-ui gets ui-virtual-list and ui-virtual-table (registry-meta updated). Tests: in-memory and jsdom with mocked layout, all passing. Benchmark vs the js-framework-benchmark rows case recorded in docs/performance.md. Risks: own engine rather than TanStack; vertical only; gallery demo needs pack:local.
<!-- SECTION:FINAL_SUMMARY:END -->
