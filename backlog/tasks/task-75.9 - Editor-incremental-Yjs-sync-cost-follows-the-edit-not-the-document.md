---
id: TASK-75.9
title: 'Editor: incremental Yjs sync (cost follows the edit, not the document)'
status: Done
assignee: []
created_date: '2026-11-07T15:21:00Z'
updated_date: '2026-11-07T15:28:00Z'
labels:
  - editor
dependencies: []
parent_task_id: TASK-75
ordinal: 154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every local change reconciles the whole ProseMirror doc into Yjs (full specEquals walk) and every remote change rebuilds the whole PM doc from Yjs; position mapping sums sizes of all preceding nodes. Measured with packages/editor/src/yjs/perf.test.ts: 38 ms per keystroke locally and ~18 ms more per remote apply at 10k paragraphs, growing linearly. That is unacceptable for large documents. The cost must follow the size of the edit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Local change cost is independent of document size apart from the O(top-level blocks) walk Yjs itself needs to index a child: unchanged subtrees are skipped by node identity
- [x] #2 Remote change cost reuses the cached ProseMirror nodes of unchanged Yjs subtrees; only changed types and their ancestors are rebuilt
- [x] #3 Relative-position and cursor mapping do not walk the whole document
- [x] #4 Fallback to the full reconcile when the Yjs tree and the last synced doc disagree (unknown nodes), never a wrong document
- [x] #5 Perf test at 10k+ paragraphs asserts per-change time stays well under the old linear cost; convergence fuzz tests also assert Yjs and the editor never drift
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. DocCache (WeakMaps of PM node/text runs/sizes per Y type), invalidated for every changed Y type and its ancestors from observeDeep.
2. Local: syncChildren diffs old vs new PM doc by node identity and touches only the changed children; seeds the cache afterwards.
3. Remote: yToDoc with the cache reuses unchanged nodes, so PM diffing is identity-cheap.
4. Positions: size cache for yToPmPos, findIndex-based pmToYPos.
5. Full-reconcile fallback; perf test and drift assertions in fuzz tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Incremental sync: DocCache (per Y type PM node/text-run/size cache invalidated from observeDeep), syncChildren skips identical subtrees, pmToYPos uses childAfter. 10k paragraphs: local->yjs 38.5ms -> ~2.5ms; remote apply ~18ms -> ~5ms. Residual cost is O(top-level blocks) (Yjs XmlFragment has no search markers) with a small constant. Fuzz tests now assert no drift vs full rebuild after every local edit; perf.test.ts bounds local<25ms, remote<60ms at 10k.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Local edits no longer re-read the whole document into Yjs; remote edits reuse cached nodes. Drift checked in the randomized convergence test.
<!-- SECTION:FINAL_SUMMARY:END -->
