---
id: TASK-4
title: 'Test harness: deep text helper and realistic event helpers'
status: To Do
assignee: []
created_date: '2026-11-06 03:23'
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
- [ ] #1 Fixture or TestNode offers deep text for a node (e.g. fixture.textOf(node))
- [ ] #2 Fixture offers helpers to type into a plain input and fire keydown/change with realistic event shapes, so handlers reading $event work unchanged
- [ ] #3 examples/todomvc tests use the helpers instead of local workarounds
<!-- AC:END -->
