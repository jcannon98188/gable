---
kind: ticket
title: "Dogfood app: repack gable-ui tarballs and verify missing-component report"
status: resolved
tags:
  - ui
  - chore
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-74 - Dogfood-app-repack-gable-ui-tarballs-and-verify-missing-component-report.md
priority: medium
ordinal: 122000
---

## Question

A dogfooding app reported missing virtual list/table and panels, which exist (core/44, ui/53). Likely a stale vendored @gable/ui. Run npm run pack:local after the second pass lands, tell the dogfooder to repack, and confirm what remains missing.

## Acceptance criteria

- [ ] #1 pack:local run on the final tree and gallery tests pass against the fresh tarballs
- [ ] #2 Dogfood app confirmed to see virtual-list, virtual-table and resizable components

## Answer

Ran pack:local on the final tree; gallery vitest passes (16 files, 23 tests) after a clean reinstall (npm reused the cached same-named tarball until node_modules/@gable and the lockfile were removed). Dogfooder should repack and do the same.
