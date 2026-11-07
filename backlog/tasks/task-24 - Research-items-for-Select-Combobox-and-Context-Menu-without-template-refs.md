---
id: TASK-24
title: 'Research: items for Select, Combobox and Context Menu without template refs'
status: Done
assignee:
  - '@claude'
created_date: 2026-11-07 02:24
updated_date: '2026-11-07T02:45:00Z'
labels:
  - ui
  - research
  - ready-for-agent
dependencies:
  - TASK-20
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gable has no ng-template or TemplateRef equivalent, only slot projection. Work out how Select options, Combobox items and Context Menu items can render. Options: slot-based item components with contentChildren; a template-ref language feature; or constraining those components. DECISION NEEDED FROM THE USER before implementation: whether to add a template-ref feature to the language. Write findings as a short document with a recommendation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A written comparison of the options with a recommendation, based on what the Zag spike shows
- [ ] #2 User decision recorded before any language-level change is started
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Prototype options (a) ${} item bodies, (b) contentChildren slot items, (c) @for data items against Zag select, combobox, menu. 2. Write docs/ui-items.md with a recommendation. 3. Record notes and finish.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Correction: the design (TASK-1.4) deliberately has no ng-template/TemplateRef. Reusable fragments are html template values passed through ${} holes, or small components. Start the research there: can a ${} template value be rendered per item inside an overlay with its own context (value, selected, active)? Also check slot-based item components with contentChildren. Only escalate to the user if neither works.

Findings from the TASK-20 spike (items). Zag select/combobox/menu take items as DATA (a collection prop), not as DOM children, so no TemplateRef is needed for the machine. Verified in the spike: per-item directives with a data input, rendered by @for over a signal inside the declaring component (tabs.test.ts, block named data-driven items: [uiTabTrigger]=item.value and [disabled]=item.disabled; items added at runtime get their own prop getters and ids). The same shape fits Select: @for over the collection items with a uiSelectItem directive taking the item and applying getItemProps. NOT verified: (a) item bodies as template values in template holes with per-item context (value, selected, active); template value expressions cannot call methods, so that context must be a computed view model passed as data; (b) slot-based item components with contentChildren, where item data would have to be collected from content into the machine collection before items render, a second source of truth, so prefer data in, render out; (c) items rendered inside a portal. Recommendation so far: data-driven items rendered by @for in the declaring component, no template-ref language feature, because the machine owns the data and directives own the per-item props. Caveats: Zag keyboard navigation for these machines (typeahead, scrollIntoView, highlight) queries the DOM by item id, so the in-memory test renderer needs its Zag DOM facade (packages/ui-primitives/src/test-dom.ts) extended, or those tests must run in jsdom. Required inputs cannot be read by a directive setup-time effect (inputs bind after setup), so the item input must be non-required with a null guard in bindProps.

Findings in docs/ui-items.md. Recommendation: data in, render out (@for plus per-item directive, computed view model for per-item context); no template-ref feature, so AC #2 (user decision) is not needed and stays unchecked. (a) html holes are not implemented in core (parseTemplate throws), so ${} item bodies cannot be rendered at all today; a small row component with a view-model input works. (b) contentChildren works for static slot items but has costs: second source of truth, items cannot inject the select state (projected content injects from the declaring component), and a core bug: contentChildren never registers content created after first projection (query.ts registerEntry relies on withContentTarget, active only during initial build); removal is tracked. Also Zag ignores typeahead on elements whose tag contains 'select' or 'textarea' (custom tag ui-select-option breaks it). (c) works: Select in the in-memory renderer, Combobox and Menu in jsdom (they need CSS.escape, window, closest, so the test DOM facade is not enough). Tests: items-select, items-slots, items-combobox-menu proto tests in packages/ui-primitives; npx vitest run packages/ui-primitives: 10 files, 56 passed, 1 expected fail (the contentChildren bug). Prototypes installed @zag-js/select, combobox, menu with --no-save; package.json not changed. Suggested follow-ups (not created, need approval): fix contentChildren for late content; add select/combobox/menu deps when TASK-26 starts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Researched item rendering for Select, Combobox and Context Menu. Data-driven @for items with a per-item directive and a computed view model work for all three (Select in the in-memory renderer, Combobox and Menu in jsdom); no template-ref language feature is needed. ${} item bodies are not possible yet because html holes are unimplemented; slot items via contentChildren work for static content only because of a core bug with late-created content. Recommendation and details in docs/ui-items.md. Verified by prototype tests (npx vitest run packages/ui-primitives: 56 passed, 1 expected fail). AC #2 left unchecked: no user decision was needed.
<!-- SECTION:FINAL_SUMMARY:END -->
