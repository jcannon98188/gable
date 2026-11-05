---
id: TASK-2.16
title: Gable Vite plugin
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 08:46'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.10
  - TASK-2.14
parent_task_id: TASK-2
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The thin Vite plugin: a dev-only accept line appended to modules importing Gable, no template parsing, no production transforms, forced native class fields with fail-fast tsconfig checks, and composition beside the Tailwind v4 plugin. A production-bundle test asserts no HMR code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A dev server hot-updates a sample app with state preserved
- [x] #2 The production bundle contains no HMR code
- [x] #3 A conflicting tsconfig gives a clear fail-fast message
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
@gable/vite plugin, dev hot update, no HMR in prod bundle, tsconfig fail-fast; merged.
<!-- SECTION:FINAL_SUMMARY:END -->
