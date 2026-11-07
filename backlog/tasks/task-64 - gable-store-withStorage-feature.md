---
id: TASK-64
title: '@gable/store: withStorage feature'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T05:01:00Z'
updated_date: '2026-11-07T05:28:00Z'
labels:
  - store
dependencies: []
priority: low
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Persist store state to localStorage (split from TASK-35). Needs scope agreed: key, which state keys, serialisation, SSR safety, interplay with withHotState.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
withStorage in packages/store/src/store.ts; tests storage.test.ts; docs/store.md Persistence. Decisions: JSON envelope {v,state}; hydrate in ready hook; list before withHotState so hot state wins; debounce default 100ms, flush on destroy and pagehide; sync via storage event off by default.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added withStorage (keys, storage local/session/adapter, version+migrate, debounce, optional cross-tab sync, guarded against missing/throwing storage, SSR-safe). 8 tests; vitest packages/store/core/testing pass; docs updated.
<!-- SECTION:FINAL_SUMMARY:END -->
