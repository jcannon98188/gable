---
kind: ticket
title: contentChildren misses content created after first render
status: resolved
tags:
  - bug
  - core
  - ready-for-agent
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-29 - contentChildren-misses-content-created-after-first-render.md
assignee:
  - '@claude'
priority: medium
ordinal: 70000
---

## Question

Found in ui/24: contentChildren never sees items created after the first render (for example added later by @for or @if inside projected content). Removals are tracked. An it.fails test in packages/ui-primitives/src/items-slots.proto.test.ts captures it and flips when fixed. Slot-based items (Select options and similar) rely on this.

## Acceptance criteria

- [x] #1 contentChildren includes content added after first render, and still tracks removals
- [x] #2 The it.fails test in items-slots.proto.test.ts is converted to a normal passing test

## Implementation plan

Re-establish the content-query target when @if/@for/@switch/HMR regions rebuild (keepContentTarget in query.ts, used in view.ts).

## Implementation notes

Cause: withContentTarget was only active during the first slot projection; later control-flow rebuilds ran with no target. Fix: keepContentTarget() captures the target at region creation; createSwitcher.show, buildFor (rows, @empty) and replaceable.build re-establish it. Tests: core regression in packages/testing/src/slots-queries.test.ts; it.fails in items-slots.proto.test.ts now a plain it. vitest core/testing/ui-primitives: 38 files, 351 passed. tsc: no errors in core/testing.

## Answer

contentChildren/contentChild now see content created after first render via @if/@for/@switch, and removals still tracked. Fix in packages/core/src/query.ts (keepContentTarget) and view.ts. Added regression test; converted it.fails to it. All tests pass.
