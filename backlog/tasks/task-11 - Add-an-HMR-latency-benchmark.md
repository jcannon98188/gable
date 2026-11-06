---
id: TASK-11
title: Add an HMR latency benchmark
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06 03:35'
updated_date: '2026-11-06 03:36'
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
- [ ] #1 A script edits files in a large generated app under the Vite dev server and records edit-to-update time in a real browser
- [ ] #2 Verifies state retention across the update
<!-- AC:END -->
