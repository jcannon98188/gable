---
id: TASK-2.21
title: Template formatter and Prettier plugin
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 07:40'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.3
parent_task_id: TASK-2
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The pure formatTemplate, a template-only CLI that rewrites only html template literals, and the Prettier plugin wrapping it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Formatting is deterministic and idempotent
- [x] #2 Only html template literals are edited
- [x] #3 The Prettier plugin formats a sample project
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Formatter and Prettier plugin merged as @gable/template-format and @gable/prettier-plugin. Verified on merged integration (152 tests).
<!-- SECTION:FINAL_SUMMARY:END -->
