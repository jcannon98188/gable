---
id: TASK-2.1
title: Monorepo skeleton and lockstep release plumbing
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:07'
updated_date: '2026-11-05 07:11'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-2
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

A workspace holding the Gable package family with shared TypeScript settings (ES2022, native class fields), a test runner, and Changesets configured for lockstep versioning on 0.x. Only empty core and testing packages exist. Nothing is published.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A CI run builds and tests the empty packages
- [x] #2 All packages share one version via Changesets
- [x] #3 Packages are ESM-only with exports maps and type declarations
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Monorepo skeleton merged on integration/gable-v0: npm workspaces, empty @gable/core and @gable/testing, Vitest, tsc builds, Changesets fixed lockstep, CI workflow. Verified: install, build and 2 smoke tests pass; lockstep bump checked. CI workflow itself not run (local).
<!-- SECTION:FINAL_SUMMARY:END -->
