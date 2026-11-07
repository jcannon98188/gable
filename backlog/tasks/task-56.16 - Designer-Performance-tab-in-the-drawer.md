---
id: TASK-56.16
title: 'Designer: Performance tab in the drawer'
status: To Do
assignee: []
created_date: '2026-11-07T17:52:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a Performance tab to the bottom drawer (next to Accessibility). The Preview agent collects in-page metrics from the selected frame and reports them over the protocol (additive method, PROTOCOL_VERSION unchanged, like a11y): navigation/load timing, FCP, LCP (with the element, selectable on canvas), CLS (with shifting elements), long tasks and total blocking time, INP if available, resource summary (count, bytes, slowest), and DOM size. Add Gable-specific numbers if the devtools hook exposes them (time to first render, effect re-runs / signal updates per second, hot update to repaint time). Show each metric with a good/needs-work/poor rating using the standard web-vitals thresholds, an element link where relevant (click selects the element), a Re-run/reload-and-measure action, and the frame's device context (size, DPR, throttling when set). Optional if cheap: CPU/network throttling per frame via CDP emulation on WebView2 (labelled unavailable elsewhere). Honest empty state before first run; no fake data. Expose via MCP get_performance. Not a Lighthouse run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Preview agent reports performance metrics for the selected frame over an additive protocol method; metrics refresh on load, hot update and Re-run
- [ ] #2 Performance tab lists metrics with ratings, element links (LCP, CLS) that select the element, and an honest empty/unavailable state
- [ ] #3 MCP get_performance tool returns the same metrics
- [ ] #4 Tests added; tsc, designer build and full vitest pass; driven in headless Edge
<!-- AC:END -->
