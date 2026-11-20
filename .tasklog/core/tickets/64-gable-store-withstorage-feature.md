---
kind: ticket
title: "@gable/store: withStorage feature"
status: resolved
tags:
  - store
  - priority-low
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-64 - gable-store-withStorage-feature.md
assignee:
  - '@claude'
priority: low
ordinal: 112000
---

## Question

Persist store state to localStorage (split from core/35). Needs scope agreed: key, which state keys, serialisation, SSR safety, interplay with withHotState.

## Implementation notes

withStorage in packages/store/src/store.ts; tests storage.test.ts; docs/store.md Persistence. Decisions: JSON envelope {v,state}; hydrate in ready hook; list before withHotState so hot state wins; debounce default 100ms, flush on destroy and pagehide; sync via storage event off by default.

## Answer

Added withStorage (keys, storage local/session/adapter, version+migrate, debounce, optional cross-tab sync, guarded against missing/throwing storage, SSR-safe). 8 tests; vitest packages/store/core/testing pass; docs updated.
