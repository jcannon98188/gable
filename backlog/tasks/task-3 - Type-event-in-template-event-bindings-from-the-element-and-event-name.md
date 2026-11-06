---
id: TASK-3
title: Type $event in template event bindings from the element and event name
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:23'
updated_date: '2026-11-06 03:35'
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
- [x] #1 $event in (input), (change), (keydown) and similar bindings is typed from the element and event name (e.g. KeyboardEvent, Event with a typed currentTarget)
- [x] #2 A decision is recorded on how templates read a control's value or checked state in a handler (typed currentTarget, or #ref value reads) and it type-checks without casts
- [x] #3 examples/todomvc handlers no longer need casting helper methods
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Type DOM-event $event as the DOM event for the element/event name (already so) intersected with { readonly currentTarget: <element type> } in the language-service type-check block (emit.ts __Ev).
2. Add events-pass/events-fail fixtures and check.test.ts expectation.
3. Drop cast helper methods from examples/todomvc components; rebuild+repack language-service; verify tsc, gable-check, vitest.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: templates read a control's value/checked state through the typed currentTarget (e.g. (input)="draft.set($event.currentTarget.value)", (change)="x.set($event.currentTarget.checked)"). $event was already typed from element+event name via HTMLElementEventMap (KeyboardEvent for keydown etc.); the gap was currentTarget being EventTarget|null, so __Ev now intersects it with the element type. Component outputs and unknown events are unchanged. #ref value reads remain possible but are not needed. event.target stays EventTarget|null (correct for bubbling). Validation: language-service vitest 83/83; examples/todomvc tsc, gable-check, vitest (6) all green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
__Ev in packages/language-service/src/emit.ts now intersects DOM event types with { readonly currentTarget: <element> }, so $event.currentTarget.value/.checked type-check without casts. Added events-pass/fail fixtures and a check.test.ts expectation; removed setDraft/toggle/toggleAll helpers from the TodoMVC components. Verified: language-service vitest 83 pass; example tsc, gable-check, vitest pass.
<!-- SECTION:FINAL_SUMMARY:END -->
