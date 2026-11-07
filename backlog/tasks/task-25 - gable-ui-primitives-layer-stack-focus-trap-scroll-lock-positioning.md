---
id: TASK-25
title: '@gable/ui-primitives: layer stack, focus trap, scroll lock, positioning'
status: Done
assignee:
  - '@claude'
created_date: 2026-11-07 02:24
updated_date: '2026-11-07T02:52:00Z'
labels:
  - ui
  - ready-for-agent
dependencies:
  - TASK-20
  - TASK-21
  - TASK-22
  - TASK-23
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shared primitive layer under the components: dismissable layer stack (Escape and outside click, topmost only), focus trap and focus restore, scroll lock, aria-hidden on everything outside the active layer, roving tabindex, and positioning using @floating-ui/dom with updates on scroll and resize cleaned up through the scope. Use Zag.js for what it already provides and add only the Gable-specific seams.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New package @gable/ui-primitives with each utility documented and tested
- [x] #2 Positioning updates and cleanup are tied to the component scope
- [x] #3 Layer stack handles nested overlays correctly (only the topmost dismisses)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Compose Zag dismissable/focus-trap/remove-scroll/aria-hidden into useLayer + uiLayer. 2. usePosition + uiPosition on @floating-ui/dom. 3. useRovingTabindex + uiRoving. 4. Tests (jsdom + in-memory), docs/ui-primitives.md, add deps.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added to packages/ui-primitives: layer.ts (useLayer, UiLayer, isTopmostLayer), position.ts (usePosition, UiPosition), roving.ts (useRovingTabindex, UiRoving, UiRovingItem), exported from index. Deps added to package.json and lockfile: @zag-js/select, combobox, menu, dismissable, focus-trap, remove-scroll, aria-hidden (^1.47.0), @floating-ui/dom ^1.8.0. Design: Zag's layer stack is reused so Zag machines (Dialog) and useLayer nest together; Escape is topmost-only in Zag, the outside-press veto for lower layers is Gable's (Zag offers it to all layers). The stack object is not exported by @zag-js/dismissable, so topmost is read from the --layer-index custom property (hidden elements ignored; useLayer clears the stale marker on close). Positioning uses autoUpdate; effect cleanup and scope.onDispose remove listeners; late async results are dropped. Layer and positioning do nothing under non-DOM renderers (MACHINE_ENV.effects override); found and fixed an anchor lookup crash there. Tests: layer.dom.test.ts (8: topmost Escape, outside press, nested, mixed with Zag Dialog, focus trap and restore, scroll lock and aria-hidden with nesting, non-modal, destroy cleanup), position.dom.test.ts (6: placement, input changes, resize and ancestor scroll, open toggle, disposal and destroy remove listeners), roving.dom.test.ts (3), primitives.test.ts (roving in-memory 5, layer/position inert 1). npx vitest run packages/ui-primitives: 14 files, 80 passed; tsc -p packages/ui-primitives/tsconfig.build.json clean. Docs: docs/ui-primitives.md. Limits: uiPosition lacks flip/shift/sameWidth inputs; roving refresh needed on non-DOM renderers; focus trap and aria-hidden depend on jsdom/real DOM so not covered in-memory.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added layer (useLayer/uiLayer: Zag layer stack, focus trap and restore, scroll lock, aria-hidden outside), positioning (usePosition/uiPosition on @floating-ui/dom, scope-cleaned autoUpdate) and roving tabindex (useRovingTabindex/uiRoving) to @gable/ui-primitives, with docs in docs/ui-primitives.md, and added the select/combobox/menu/dismissable/focus-trap/remove-scroll/aria-hidden and @floating-ui/dom dependencies. Verified by 80 passing tests in packages/ui-primitives (jsdom and in-memory) and clean tsc. Limits are listed in the notes.
<!-- SECTION:FINAL_SUMMARY:END -->
