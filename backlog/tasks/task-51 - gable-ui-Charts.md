---
id: TASK-51
title: 'gable-ui: Charts'
status: To Do
assignee: []
created_date: '2026-11-07T03:32:00Z'
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
- [ ] #1 Decide on a charting approach and ship a themed chart wrapper using the --chart-* tokens
- [ ] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->
