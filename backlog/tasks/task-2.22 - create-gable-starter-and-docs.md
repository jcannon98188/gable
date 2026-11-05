---
id: TASK-2.22
title: create-gable starter and docs
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 09:07'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.16
  - TASK-2.20
  - TASK-2.21
parent_task_id: TASK-2
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

create-gable copies the single starter template (Vite, TypeScript, Tailwind v4, Vitest, Prettier, sample Counter app with service and test, language-service wiring, check script, editor settings), pins versions to its own release, and detects the invoking package manager. Includes the Getting started page and the manual-setup page. Not published.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CI scaffolds the starter into a temp directory and runs install, check, test and build
- [x] #2 The CI test asserts no HMR code in the production bundle
- [x] #3 The docs pages exist and mirror the template
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
create-gable starter, scaffold CI test, docs; merged. Nothing published.
<!-- SECTION:FINAL_SUMMARY:END -->
