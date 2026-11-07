---
id: TASK-74
title: 'Dogfood app: repack gable-ui tarballs and verify missing-component report'
status: Done
assignee: []
created_date: '2026-11-07T05:05:00Z'
updated_date: '2026-11-07T05:18:00Z'
labels:
  - ui
  - chore
dependencies: []
priority: medium
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A dogfooding app reported missing virtual list/table and panels, which exist (TASK-44, TASK-53). Likely a stale vendored @gable/ui. Run npm run pack:local after the second pass lands, tell the dogfooder to repack, and confirm what remains missing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pack:local run on the final tree and gallery tests pass against the fresh tarballs
- [ ] #2 Dogfood app confirmed to see virtual-list, virtual-table and resizable components
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ran pack:local on the final tree; gallery vitest passes (16 files, 23 tests) after a clean reinstall (npm reused the cached same-named tarball until node_modules/@gable and the lockfile were removed). Dogfooder should repack and do the same.
<!-- SECTION:NOTES:END -->
