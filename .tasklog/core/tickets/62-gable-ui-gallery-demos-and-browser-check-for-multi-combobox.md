---
kind: ticket
title: ">-\n  gable-ui: gallery demos and browser check for multi-combobox, RTL/cascading\n  resizable, stacked chart"
status: claimed
claimed_by: imported
tags:
  - ui
  - in-progress
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-62 - gable-ui-gallery-demos-and-browser-check-for-multi-combobox-RTL-cascading-resizable-stacked-chart.md
ordinal: 110000
---

## Question

Second-pass additions (UiMultiCombobox, resizable RTL and cascading drags, chart stacked/legend toggle/animation) are covered by jsdom tests only. Add a multi-combobox demo and an RTL resizable demo to examples/ui-gallery (needs pack:local; gallery.ts is shared), and verify pointer drags, RTL layout, the chart enter animation and prefers-reduced-motion in a real browser.

## Acceptance criteria

- [x] #1 Gallery shows multi-combobox, RTL resizable group and stacked chart with legend toggling
- [ ] #2 Checked in a browser: pointer drag cascade, RTL drag direction, chart animation and reduced motion

## Implementation plan

1. Multi-combobox in main gallery; RTL + cascading sections in resizable page; legend toggle test on existing stacked chart card. 2. jsdom tests.

## Implementation notes

Added UiMultiCombobox section to main gallery (gallery.ts), RTL and cascading resizable sections to resizable page, legend-toggle tests on the existing stacked chart card (chart-demo). jsdom + axe tests added (gallery.test, resizable-demo(.dom).test, chart-demo(.dom).test); vitest 27/27. AC2 (real-browser drag cascade, RTL drag, chart animation, reduced motion) NOT done: needs a browser; kept unchecked. Note: virtual test renderer cannot exercise RTL (no real host.closest), so the RTL test runs under jsdom.
