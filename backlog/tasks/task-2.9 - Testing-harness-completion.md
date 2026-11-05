---
id: TASK-2.9
title: Testing harness completion
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 08:27'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.7
  - TASK-2.8
parent_task_id: TASK-2
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

settle, flushSync, advance(ms) on the runner fake timers, component overrides, errors.expect, and stable pretty-printed html() snapshots, with auto-cleanup. Runner-agnostic with no globals and no jsdom.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Debounce and timer behaviour is testable deterministically
- [x] #2 Leftover error reports fail a test at teardown
- [x] #3 overrides replace a child or lazy entry for one test
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
settle, flushSync, advance, errors.expect, overrides, auto-cleanup; merged.
<!-- SECTION:FINAL_SUMMARY:END -->
