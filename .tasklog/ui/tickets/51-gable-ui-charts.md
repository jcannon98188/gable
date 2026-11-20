---
kind: ticket
title: "gable-ui: Charts"
status: claimed
claimed_by: "@claude"
tags:
  - ui
  - in-progress
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-51 - gable-ui-Charts.md
assignee:
  - '@claude'
ordinal: 92000
---

## Question

shadcn's Chart wraps Recharts. There is no Gable charting equivalent, so this needs a decision on the charting library (or a small SVG implementation) first. Deferred from ui/28.

## Acceptance criteria

- [x] #1 Decide on a charting approach and ship a themed chart wrapper using the --chart-* tokens
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery

## Implementation plan

1. Dependency-free SVG chart (UiChart): line/area/bar/pie/donut, nice scales, legend, tooltip, a11y. 2. --chart-1..5 tokens in theme.css. 3. registry-meta + index export. 4. jsdom tests with axe. 5. Gallery page chart.html.

## Implementation notes

Decision: no charting dependency. shadcn Chart wraps Recharts (React-only); d3-scale/d3-shape would save little since geometry (nice ticks, polylines, arcs) is ~60 lines and must be precomputed as view models anyway. UiChart is one file (packages/ui/src/components/chart.ts), inputs: type, data, xKey, series[{key,label,color}], height, showGrid, showLegend, innerRadius, totalLabel; width follows the host via ResizeObserver. --chart-1..5 (and --color-chart-*) were missing from theme.css and were added (neutral light/dark values from shadcn). A11y: svg is role=group + aria-roledescription=chart (role=img would make the focusable points nested-interactive per axe), one roving-tabindex labelled point per category/slice, arrow/Home/End/Escape, aria-hidden tooltip, sr-only data table. Not covered: stacked series, secondary axis, zoom, animation, legend toggling. Tests: packages/ui/src/components/chart.dom.test.ts (9, incl. axe on all 5 types) pass. Gallery page examples/ui-gallery/chart.html + src/chart-demo*.ts; its test and visual check need npm run pack:local first (not run, packed @gable/ui is stale).

Second pass: stacked series for bar/area (stacked input; negatives stack down; scale from sums), legend entries are toggle buttons (aria-pressed, last visible series stays), enter animation (animate input, animate-in + motion-reduce:animate-none), bars stay anchored. Tests: chart-stack.dom.test.ts (7, incl. axe). Gallery stacked card added to chart-demo.ts. Still not browser-verified (AC3 unchecked). Remaining: core/62 (browser check), ui/63 (secondary axis, zoom, pie toggling).
