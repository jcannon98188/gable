---
kind: ticket
title: "@gablejs/store: devtools and withStorage"
status: open
blocked_by: [31]
tags:
  - store
  - needs-triage
  - priority-low
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-35 - gable-store-devtools-and-withStorage.md
priority: low
ordinal: 76000
---

## Question

Later work: a devtools integration (state and action history) and a withStorage feature persisting state to localStorage. Not scheduled; triage before starting.

## Acceptance criteria

- [ ] #1 Scope agreed before implementation

## Implementation notes

Devtools for stores should plug into the general devtools instrumentation task (core/45) rather than building a separate panel.

Devtools plug-in point (from core/45): stores need no dependency on core internals. In dev, call globalThis.__GABLE_DEVTOOLS_HOOK__?.registerInspector(id, { label, snapshot: () => state }) and use the returned handle.log(type, data) for each action or change. Guard with the DEV flag so production drops it. The extension's Stores tab then shows the snapshot and history. See docs/devtools.md.

Done: withDevtools(name) in @gablejs/store (store.ts): dev-gated (__GABLE_DEV__), registers via globalThis.__GABLE_DEVTOOLS_HOOK__.registerInspector, logs a 'patch' entry (changed keys) per changing patchState, disposes on store destroy; tests in packages/store/src/devtools.test.ts; docs/store.md and docs/devtools.md. Remaining: withStorage and action-level history (see follow-ups).
