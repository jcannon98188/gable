---
id: TASK-2.14
title: HMR runtime
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 08:27'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.4
  - TASK-2.7
parent_task_id: TASK-2
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The dev-only runtime: registry keyed by module URL and export name, canonical-class patching, re-setup on a new instance with State transfer by name and kind, service cascade, atomic transactions with rollback, hmr modes (reset, reload, ignore) at class and module level, hotState, and fixture.hotReplace. Seed the tests from the nine scenarios of the HMR prototype on the prototype/hmr-spike branch (template edit, computed edit, method-only edit, rename, kind change, service cascade, one save with two files, broken file, reset).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every prototype scenario passes through hotReplace
- [x] #2 A failing update leaves the app unchanged
- [x] #3 State transfer, cascade and rollback behave as specified
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
HMR runtime with all nine prototype scenarios via fixture.hotReplace; merged.
<!-- SECTION:FINAL_SUMMARY:END -->
