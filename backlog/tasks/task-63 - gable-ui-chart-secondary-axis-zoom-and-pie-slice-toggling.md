---
id: TASK-63
title: 'gable-ui: chart secondary axis, zoom and pie-slice toggling'
status: In Progress
assignee: []
created_date: '2026-11-07T04:59:00Z'
updated_date: '2026-11-07T05:31:00Z'
labels:
  - ui
dependencies: []
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Not covered by UiChart (TASK-51): a secondary y axis, zoom/brush, and legend toggling of pie and donut slices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Right-axis series (axis: right) drawn against its own scale and ticks
- [ ] #2 Zoom into an x-range (drag, ctrl+wheel, +/- keys, buttons) with reset and accessible status
- [x] #3 Pie and donut slices toggle through the legend with aria-pressed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in chart.ts; jsdom + axe tests in chart-zoom.dom.test.ts. AC1 and AC2 left unchecked: visual scales and real pointer drag/wheel need a browser check.
<!-- SECTION:NOTES:END -->
