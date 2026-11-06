---
id: TASK-11
title: Add an HMR latency benchmark
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:35'
updated_date: '2026-11-06 03:57'
labels:
  - example
  - performance
  - hmr
dependencies: []
priority: low
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
No existing benchmark measures hot-update latency or state retention, which is Gable's headline feature. Measure edit-to-DOM-updated time for a component, template, style and service edit on a large app.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A script edits files in a large generated app under the Vite dev server and records edit-to-update time in a real browser
- [x] #2 Verifies state retention across the update
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. examples/hmr-benchmark: gen.mjs generates an N-component tree (signals, computed, method, style, root service). 2. bench.mjs starts Vite programmatically, drives Chrome/Edge via Playwright, rewrites files per edit kind and times edit to DOM updated in-page. 3. Verify state retention (counter, input value, service, no reload). 4. README, root bench:hmr script.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ran node bench.mjs (500 and 2000 components, 10 iterations, Edge 156 headless): all rows state kept, no reloads. Findings: method-only edit leaves computeds that called it stale; leaf edit latency grows with app size (~45ms at 500, ~165ms at 2000); service edit ~1.4s at 2000.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added examples/hmr-benchmark (generator, Playwright harness, README) and root bench:hmr script. Verified by running the full benchmark at 500 and 2000 components in a real browser: timings recorded for class field/method, template, style and service edits, and counter signal, input value and service state survived every edit with no page reload.
<!-- SECTION:FINAL_SUMMARY:END -->
