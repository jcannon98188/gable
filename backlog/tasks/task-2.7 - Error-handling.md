---
id: TASK-2.7
title: Error handling
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:07'
updated_date: '2026-11-05 08:05'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.6
parent_task_id: TASK-2
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The root ErrorHandler Token with error context (source, component, injector, detail), default log-and-swallow, and the fail-soft rules for setup, effects, events, bindings and subscriptions. The test harness collects reports and rethrows from flush and settle.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each failure source is reported with correct attribution and the app keeps running as specified
- [x] #2 A failed Setup disposes its scope and renders an empty host while siblings continue
- [x] #3 A throwing handler falls back to the console without recursion
- [x] #4 Unexpected errors fail tests unless claimed
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ErrorHandler token, error contexts, fail-soft rules, claimErrors on the Fixture; merged, 241 tests green.
<!-- SECTION:FINAL_SUMMARY:END -->
