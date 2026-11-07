---
id: TASK-20
title: 'Spike: Zag.js to signals adapter (Dialog and Tabs end to end)'
status: Done
assignee:
  - '@claude'
created_date: 2026-11-07 02:24
updated_date: '2026-11-07T02:38:00Z'
labels:
  - ui
  - spike
  - ready-for-agent
dependencies: []
priority: high
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prove that Zag.js state machines can drive Gable components. Build a small adapter that turns a Zag machine into signals (a computed API object whose prop getters are applied as host bindings), and use it for Dialog and Tabs. Goal: find the remaining gaps in core before the other ui tasks start. Zag is approved as a dependency (MIT).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An adapter binds a Zag machine and its props to signals, with cleanup tied to the component scope
- [x] #2 Dialog and Tabs work end to end in the in-memory test renderer and jsdom, including keyboard behaviour
- [x] #3 A written list of core gaps found (portal, presence, host access, items) is added to the follow-up tasks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New package packages/ui-primitives (@gable/ui-primitives) with @zag-js/core, dialog, tabs, vanilla as deps. 2. useMachine adapter on Zag's VanillaMachine: version signal, computed api, props synced by effect, stop on scope dispose. 3. bindProps: apply a Zag prop bag to the host via the Renderer (attrs, classes, styles, diffed listeners). 4. Dialog and Tabs as attribute directives sharing a provided State class. 5. Test renderer DOM facade for Zag, tests in test renderer and jsdom incl. keyboard. 6. Record core gaps on TASK-21/22/24.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built packages/ui-primitives (@gable/ui-primitives): useMachine (machine.ts) wraps Zag's VanillaMachine: version signal bumped on subscribe, computed api = connect(service), props() tracked by an effect that calls updateProps, machine stopped via currentScope().onDispose. bindProps (props.ts) spreads a Zag prop bag onto a node through the Renderer (attrs, boolean attrs, classes, styles, diffed stable listeners), owned by the scope. Dialog and Tabs are attribute directives sharing a provided DialogState/TabsState; the declaring component lists the State in providers and calls bind(() => props) in Setup. Testing: ./testing export (test-dom.ts) gives the in-memory renderer a DOM facade for Zag plus domEvent/pressKey/focusNode. Core gaps found (host access): injectHost works for directives (setup only; typed unknown). Other core gaps: (1) Projected content is injected from the declaring component, not from the slot owner, so a wrapper component cannot provide machine state to its slotted parts; hence no <ui-dialog> wrapper, the consumer component provides State. (2) Inputs are bound after Setup but effects run once synchronously, so a directive effect cannot read a required input; worked around with non-required inputs and a null-returning prop getter. A post-input-binding hook (or deferring first effect run) would remove this. (3) Zag needs a DOM: machines resolve elements via getRootNode().getElementById and use querySelectorAll, focus, setAttribute, dataset, matches, contains, requestAnimationFrame. Under non-DOM renderers the adapter disables machine effects (focus trap, scroll lock, outside click, aria-hidden) and takes MACHINE_ENV for getRootNode; the test renderer needs the facade, whose selector support is a subset (no :not or ~=, rewritten in the facade). Escape-to-close and focus trap are therefore covered in jsdom only. (4) The test renderer does not bubble events: tabs keydown is on the tablist, so tests dispatch on the list with the trigger as target (pressKey). (5) jsdom runs all rAF callbacks of a frame without microtask checkpoints; Zag chains two frames for arrow navigation, so the jsdom test replaces rAF with setTimeout 0 (browsers are fine). (6) Zag Dialog sets hidden immediately on close: see TASK-22. Validation: npx vitest run packages/ui-primitives: 3 files, 17 tests pass (tabs and dialog in the in-memory renderer, dialog and tabs in jsdom incl. Escape, focus, arrow/Home/End, disabled skipping, destroy cleanup); npx tsc -p packages/ui-primitives/tsconfig.build.json --noEmit clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @gable/ui-primitives with a Zag-to-signals adapter (useMachine, bindProps) and Dialog and Tabs directives. Verified by 17 passing tests (npx vitest run packages/ui-primitives) in the in-memory test renderer and jsdom, including keyboard behaviour and scope cleanup. Core gaps recorded on TASK-20, TASK-21, TASK-22 and TASK-24.
<!-- SECTION:FINAL_SUMMARY:END -->
