---
kind: ticket
title: "Test harness: deep text helper and realistic event helpers"
status: resolved
tags:
  - dx
  - testing
  - priority-medium
created: 2026-11-06
updated: 2026-11-06
imported_from: backlog/tasks/task-4 - Test-harness-deep-text-helper-and-realistic-event-helpers.md
assignee:
  - '@claude'
priority: medium
ordinal: 45000
---

## Question

Testing TodoMVC needed a hand-written recursive textOf(node) because TestNode.text is only the node's own text, and fake event objects like { target: { value } } for dispatch because fixture.fill only suits [field]-bound controls, not handlers that read $event.

## Acceptance criteria

- [x] #1 Fixture or TestNode offers deep text for a node (e.g. fixture.textOf(node))
- [x] #2 Fixture offers helpers to type into a plain input and fire keydown/change with realistic event shapes, so handlers reading $event work unchanged
- [x] #3 examples/todomvc tests use the helpers instead of local workarounds

## Implementation plan

1. Add Fixture.textOf (deep text), type/change/keydown helpers building DOM-shaped events with a live target view over node props.
2. Tests in packages/testing/src/events.test.ts.
3. Rebuild/pack testing into todomvc vendor, convert todo-app.test.ts to the helpers.
4. Document in docs/getting-started.md.

## Implementation notes

Validation: npx vitest run packages/testing events.test.ts 4/4 pass (full suite 271 pass; composition.test.ts file fails to parse due to another agent's in-progress core/05 regex); examples/todomvc tsc clean, vitest 6/6.

## Answer

Added fixture.textOf, type, change, keydown with realistic events (target view of live value/checked, key/code/modifiers, preventDefault); todomvc test migrated and drops local workarounds. Verified by new unit tests and todomvc tsc + vitest.
