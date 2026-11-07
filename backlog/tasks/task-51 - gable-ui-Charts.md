---
id: TASK-51
title: 'gable-ui: Charts'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T03:32:00Z'
updated_date: '2026-11-07T04:41:00Z'
labels:
  - ui
dependencies: []
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
shadcn's Chart wraps Recharts. There is no Gable charting equivalent, so this needs a decision on the charting library (or a small SVG implementation) first. Deferred from TASK-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Decide on a charting approach and ship a themed chart wrapper using the --chart-* tokens
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Dependency-free SVG chart (UiChart): line/area/bar/pie/donut, nice scales, legend, tooltip, a11y. 2. --chart-1..5 tokens in theme.css. 3. registry-meta + index export. 4. jsdom tests with axe. 5. Gallery page chart.html.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: no charting dependency. shadcn Chart wraps Recharts (React-only); d3-scale/d3-shape would save little since geometry (nice ticks, polylines, arcs) is ~60 lines and must be precomputed as view models anyway. UiChart is one file (packages/ui/src/components/chart.ts), inputs: type, data, xKey, series[{key,label,color}], height, showGrid, showLegend, innerRadius, totalLabel; width follows the host via ResizeObserver. --chart-1..5 (and --color-chart-*) were missing from theme.css and were added (neutral light/dark values from shadcn). A11y: svg is role=group + aria-roledescription=chart (role=img would make the focusable points nested-interactive per axe), one roving-tabindex labelled point per category/slice, arrow/Home/End/Escape, aria-hidden tooltip, sr-only data table. Not covered: stacked series, secondary axis, zoom, animation, legend toggling. Tests: packages/ui/src/components/chart.dom.test.ts (9, incl. axe on all 5 types) pass. Gallery page examples/ui-gallery/chart.html + src/chart-demo*.ts; its test and visual check need npm run pack:local first (not run, packed @gable/ui is stale).
<!-- SECTION:NOTES:END -->
