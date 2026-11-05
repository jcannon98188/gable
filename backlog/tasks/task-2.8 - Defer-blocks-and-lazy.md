---
id: TASK-2.8
title: Defer blocks and lazy()
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
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

@defer with @placeholder, @loading and @error; triggers when, idle and timer; renderer-supplied triggers via the Renderer; lazy() entries in meta.imports usable only inside @defer; and fixture.defer to drive each block in tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A deferred block moves through placeholder, loading and complete or error states under test
- [x] #2 lazy() outside @defer is a dev-time error
- [x] #3 Unknown triggers error naming the renderer
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
@defer blocks, lazy(), fixture.defer; merged, 241 tests green.
<!-- SECTION:FINAL_SUMMARY:END -->
