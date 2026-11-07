---
id: TASK-35
title: '@gable/store: devtools and withStorage'
status: To Do
assignee: []
created_date: '2026-11-07T03:12:00Z'
updated_date: '2026-11-07T05:01:00Z'
labels:
  - store
  - needs-triage
dependencies:
  - TASK-31
priority: low
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Later work: a devtools integration (state and action history) and a withStorage feature persisting state to localStorage. Not scheduled; triage before starting.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scope agreed before implementation
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Devtools for stores should plug into the general devtools instrumentation task (TASK-45) rather than building a separate panel.

Devtools plug-in point (from TASK-45): stores need no dependency on core internals. In dev, call globalThis.__GABLE_DEVTOOLS_HOOK__?.registerInspector(id, { label, snapshot: () => state }) and use the returned handle.log(type, data) for each action or change. Guard with the DEV flag so production drops it. The extension's Stores tab then shows the snapshot and history. See docs/devtools.md.

Done: withDevtools(name) in @gable/store (store.ts): dev-gated (__GABLE_DEV__), registers via globalThis.__GABLE_DEVTOOLS_HOOK__.registerInspector, logs a 'patch' entry (changed keys) per changing patchState, disposes on store destroy; tests in packages/store/src/devtools.test.ts; docs/store.md and docs/devtools.md. Remaining: withStorage and action-level history (see follow-ups).
<!-- SECTION:NOTES:END -->
