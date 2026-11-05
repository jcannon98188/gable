---
id: TASK-2.3
title: 'Template language: bindings and control flow'
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:07'
updated_date: '2026-11-05 07:26'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.2
parent_task_id: TASK-2
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The full template syntax: attribute, class, style and event bindings, two-way model binding, template refs, @if/@else, @for with required track and @empty, @switch, @let, and the restricted expression language (property reads, zero-argument signal reads, literals, !, ??). No eval; templates parse once per call site.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each construct renders and updates correctly through the Fixture
- [x] #2 Disallowed expressions give a clear dev-time error
- [x] #3 Handlers may call functions with references, literals or the event
- [x] #4 @for without track is rejected
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Template bindings and control flow merged on integration/gable-v0 (41 tests at branch, 61 after merge with DI). Verified by build and test run on the merged branch.
<!-- SECTION:FINAL_SUMMARY:END -->
