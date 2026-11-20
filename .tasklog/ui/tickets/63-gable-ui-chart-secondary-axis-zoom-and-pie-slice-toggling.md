---
kind: ticket
title: "gable-ui: chart secondary axis, zoom and pie-slice toggling"
status: open
tags:
  - ui
  - in-progress
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-63 - gable-ui-chart-secondary-axis-zoom-and-pie-slice-toggling.md
ordinal: 111000
---

## Question

Not covered by UiChart (ui/51): a secondary y axis, zoom/brush, and legend toggling of pie and donut slices.

## Acceptance criteria

- [ ] #1 Right-axis series (axis: right) drawn against its own scale and ticks
- [ ] #2 Zoom into an x-range (drag, ctrl+wheel, +/- keys, buttons) with reset and accessible status
- [x] #3 Pie and donut slices toggle through the legend with aria-pressed

## Implementation notes

Implemented in chart.ts; jsdom + axe tests in chart-zoom.dom.test.ts. AC1 and AC2 left unchecked: visual scales and real pointer drag/wheel need a browser check.
