---
id: TASK-29
title: contentChildren misses content created after first render
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T02:46:00Z'
updated_date: '2026-11-07T02:47:00Z'
labels:
  - bug
  - core
  - ready-for-agent
dependencies: []
priority: medium
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-24: contentChildren never sees items created after the first render (for example added later by @for or @if inside projected content). Removals are tracked. An it.fails test in packages/ui-primitives/src/items-slots.proto.test.ts captures it and flips when fixed. Slot-based items (Select options and similar) rely on this.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 contentChildren includes content added after first render, and still tracks removals
- [x] #2 The it.fails test in items-slots.proto.test.ts is converted to a normal passing test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Re-establish the content-query target when @if/@for/@switch/HMR regions rebuild (keepContentTarget in query.ts, used in view.ts).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: withContentTarget was only active during the first slot projection; later control-flow rebuilds ran with no target. Fix: keepContentTarget() captures the target at region creation; createSwitcher.show, buildFor (rows, @empty) and replaceable.build re-establish it. Tests: core regression in packages/testing/src/slots-queries.test.ts; it.fails in items-slots.proto.test.ts now a plain it. vitest core/testing/ui-primitives: 38 files, 351 passed. tsc: no errors in core/testing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
contentChildren/contentChild now see content created after first render via @if/@for/@switch, and removals still tracked. Fix in packages/core/src/query.ts (keepContentTarget) and view.ts. Added regression test; converted it.fails to it. All tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
