---
id: TASK-68
title: 'Root npm run build: @gable/ui fails on command.ts regex'
status: Done
assignee: []
created_date: '2026-11-07T05:01:00Z'
updated_date: '2026-11-07T05:23:00Z'
labels:
  - ui
dependencies: []
priority: high
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
command.ts(47,40) TS1517 Range out of order in character class breaks npm run build (and create-gable scaffold.test, which runs the root build). Owner: gable-ui components work.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Resolved: the command.ts error seen mid-session no longer reproduces; npm run build exits 0 on the final tree (commit 1ce7908).
<!-- SECTION:NOTES:END -->
