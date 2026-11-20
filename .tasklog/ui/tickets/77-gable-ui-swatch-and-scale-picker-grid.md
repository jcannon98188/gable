---
kind: ticket
title: "gable-ui: Swatch and scale picker grid"
status: resolved
tags:
  - gable-ui
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-77 - gable-ui-Swatch-and-scale-picker-grid.md
priority: medium
ordinal: 134000
---

## Question

The designer's Tailwind panel uses plain buttons for colour swatches and spacing scales (tailwind-panel.ts:34 TODO(gable-ui)): it needs selectable cells with a current-value marker and a hover preview hook.

## Acceptance criteria

- [x] #1 A grid component renders cells from data (value, label, optional CSS colour or content) with roving-tabindex arrow-key navigation (both axes)
- [x] #2 A model for the selected value and a visible current-value marker (aria-selected or aria-checked as appropriate)
- [x] #3 A hovered/focused output (value or null) usable for live preview, fired on pointer hover and keyboard focus and cleared on leave
- [x] #4 Unit tests, an axe check and a gallery demo

## Implementation plan

New ui-swatch-grid (radiogroup, roving tabindex, 2D arrows, model value, hovered output) + dom tests + gallery swatch.html

## Implementation notes

packages/ui/src/components/swatch-grid.ts, swatch-grid.dom.test.ts (6 tests incl. axe), gallery swatch demo + test. Not verified in a real browser.

## Answer

Added UiSwatchGrid (ui-swatch-grid): cells from SwatchItem data, roving tabindex, arrow keys on both axes skipping disabled, value model with aria-checked and ring, hovered output on pointer enter/focus, null on leave. Registered in index.ts and registry-meta.
