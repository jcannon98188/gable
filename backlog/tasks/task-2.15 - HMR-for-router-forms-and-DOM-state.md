---
id: TASK-2.15
title: 'HMR for router, forms and DOM state'
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 09:07'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.10
  - TASK-2.11
  - TASK-2.13
  - TASK-2.14
parent_task_id: TASK-2
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

Router state, route injectors and form state (value, touched, baseline) survive hot updates; the DOM renderer captures and restores focus, selection, scroll and input values around a view rebuild where the structure matches.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Routed and form state survive an edit under test
- [x] #2 Focus and input text survive a template rebuild in the DOM renderer
- [x] #3 A config that no longer matches the URL keeps the old config and reports
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Router, form and DOM view state survive hot updates; merged.
<!-- SECTION:FINAL_SUMMARY:END -->
