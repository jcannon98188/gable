---
id: TASK-3
title: Type $event in template event bindings from the element and event name
status: To Do
assignee: []
created_date: '2026-11-06 03:23'
labels:
  - dx
  - language-service
dependencies: []
priority: medium
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Building the TodoMVC example (examples/todomvc), `(input)="draft.set($event.target.value)"` failed gable-check because $event is plain Event and target is EventTarget | null. Every input/change handler needed a hand-written method that casts event.target. Templates should be able to read the common control values without boilerplate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 $event in (input), (change), (keydown) and similar bindings is typed from the element and event name (e.g. KeyboardEvent, Event with a typed currentTarget)
- [ ] #2 A decision is recorded on how templates read a control's value or checked state in a handler (typed currentTarget, or #ref value reads) and it type-checks without casts
- [ ] #3 examples/todomvc handlers no longer need casting helper methods
<!-- AC:END -->
