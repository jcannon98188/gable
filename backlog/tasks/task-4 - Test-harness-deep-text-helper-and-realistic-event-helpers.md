---
id: TASK-4
title: 'Test harness: deep text helper and realistic event helpers'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:23'
updated_date: '2026-11-06 03:33'
labels:
  - dx
  - testing
dependencies: []
priority: medium
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Testing TodoMVC needed a hand-written recursive textOf(node) because TestNode.text is only the node's own text, and fake event objects like { target: { value } } for dispatch because fixture.fill only suits [field]-bound controls, not handlers that read $event.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fixture or TestNode offers deep text for a node (e.g. fixture.textOf(node))
- [x] #2 Fixture offers helpers to type into a plain input and fire keydown/change with realistic event shapes, so handlers reading $event work unchanged
- [x] #3 examples/todomvc tests use the helpers instead of local workarounds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add Fixture.textOf (deep text), type/change/keydown helpers building DOM-shaped events with a live target view over node props.
2. Tests in packages/testing/src/events.test.ts.
3. Rebuild/pack testing into todomvc vendor, convert todo-app.test.ts to the helpers.
4. Document in docs/getting-started.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: npx vitest run packages/testing events.test.ts 4/4 pass (full suite 271 pass; composition.test.ts file fails to parse due to another agent's in-progress TASK-5 regex); examples/todomvc tsc clean, vitest 6/6.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added fixture.textOf, type, change, keydown with realistic events (target view of live value/checked, key/code/modifiers, preventDefault); todomvc test migrated and drops local workarounds. Verified by new unit tests and todomvc tsc + vitest.
<!-- SECTION:FINAL_SUMMARY:END -->
