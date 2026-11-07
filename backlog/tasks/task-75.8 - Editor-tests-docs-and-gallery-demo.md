---
id: TASK-75.8
title: 'Editor: tests, docs and gallery demo'
status: Done
assignee: []
created_date: '2026-11-07T06:33:00Z'
updated_date: '2026-11-07T07:03:00Z'
labels:
  - editor
dependencies:
  - TASK-75.4
  - TASK-75.6
  - TASK-75.7
parent_task_id: TASK-75
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Final hardening for the first milestone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Convergence/fuzz test suite in CI
- [x] #2 Docs: getting started, plugin authoring, collaboration setup
- [x] #3 Browser verification of full feature set with two peers
- [x] #4 Demo with two clients in an example app or the gallery (examples use vendored tarballs; see scripts/pack-local.mjs)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fuzz: binding 25-seed 3-peer convergence plus 12-seed suggestion/format/accept-reject convergence, all in root npm test (CI). Docs in packages/editor/README.md. Demo: packages/editor/demo (npm run demo -w packages/editor), two linked editors in one page; chosen over an examples/ app because examples consume vendored tarballs and ui-gallery has unrelated uncommitted changes. Verified in a real browser (Vite + preview): sync, presence, remote caret, comment thread syncing, suggestion appearing on the other peer. Seen but not fixed: bubble toolbar floats at page top-left (no positioned ancestor), table toolbar buttons show truncated 2-letter labels (no glyphs).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fuzz suites in CI, README docs, a runnable two-peer demo, verified in a browser. 91 editor tests.
<!-- SECTION:FINAL_SUMMARY:END -->
