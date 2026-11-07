---
id: TASK-22
title: 'Core: deferred node removal hook and ui-presence for exit animations'
status: Done
assignee:
  - '@claude'
created_date: 2026-11-07 02:24
updated_date: '2026-11-07T02:45:00Z'
labels:
  - ui
  - core
  - ready-for-agent
dependencies:
  - TASK-20
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision made: presence is a ui-presence component inside the primitives package, not new control-flow syntax (React/Radix keeps Presence internal to its primitives, and shadcn users only style data-state with CSS). Core needs one small hook so a component can keep its children nodes until a promise resolves (today @if removes nodes immediately; retireView is dev/HMR only). ui-presence keeps content mounted while an exit animation or transition runs (animationend / transitionend, no animation means unmount at once) and sets data-state open or closed. Revisit after the Zag spike shows how Zag presence handling behaves.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A core hook allows a component to hold its children nodes until a promise resolves, without changing @if, @for or @switch
- [x] #2 ui-presence sets data-state, waits for animationend/transitionend, and unmounts immediately when there is no animation
- [x] #3 Tests cover enter, exit with animation, exit without animation, and disposal during an exit
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core removal.ts: holdRemoval() + disposeAndRemove(), used by @if/@switch/@for/@for-empty in view.ts (no syntax change). 2. ui-primitives presence.ts: usePresence, UiPresence, PRESENCE_ENV, delayHidden. 3. Dialog content/backdrop delay hidden via presence. 4. Tests: testing/removal.test.ts, ui-primitives presence.test.ts (in-memory) and presence.dom.test.ts (jsdom).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gaps found by the TASK-20 spike (presence). 1) Zag Dialog content/backdrop props set hidden: !open immediately (dialog.connect), so closing hides at once and an exit animation cannot play. The spike keeps content mounted and toggles the hidden attribute; no @if is involved, so the core node-removal hook is not needed for Dialog/Tabs as built. It is needed for components that conditionally render (@if) overlay content. 2) For exit animations ui-presence must also override hidden: bindProps (packages/ui-primitives/src/props.ts) applies the Zag bag verbatim, so ui-presence needs a way to veto/delay hidden (e.g. bindProps option or a prop-bag transform) until animationend/transitionend. @zag-js/presence exists and could drive this; not tried in the spike. 3) Presence needs the content element: it can use injectHost() inside an attribute directive (works), so no template ref is required. 4) Under jsdom there is no animation events or computed animation-name, so the 'no animation means unmount at once' branch is what tests will exercise; plan fake animationend dispatch. 5) The in-memory test renderer has no getComputedStyle; ui-presence needs a renderer-neutral way to ask 'is an animation running' (renderer method or optional capability).

Core hook: holdRemoval(promise) (exported from @gable/core/internal) is callable from a scope onDispose cleanup while control flow disposes a body; nodes are removed after all holds settle (rejections too). Returns false outside control-flow removal (app teardown), so callers finish at once. Presence (ui-primitives/src/presence.ts): sets data-state, listens on host for animationend/animationcancel/transitionend/transitioncancel (ignores events from descendants), with a computed-duration+100ms timer fallback so a transition that never ran cannot stick. PRESENCE_ENV.exitDuration(host) is the renderer-neutral 'is an animation running' seam (default: getComputedStyle, longhands or shorthand; null in the memory renderer unless provided). Dialog content/backdrop use delayHidden() around the Zag bag so hidden waits for exit; no props.ts change needed. Known limits: a ui-presence with [present] bound false from the start counts as one close (animates only if closed state declares an animation and element visible); first end event releases (multiple simultaneous animations with different lengths end at the first); held nodes stay in the tree if the whole app is destroyed mid-hold until the end event or timer. Verification: npx vitest run: 561 passed; tsc clean for core, testing, ui-primitives. Unrelated: language-service check.test flaked once under load, passes alone; portal.test.ts (TASK-21 WIP) was failing mid-run earlier.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added core holdRemoval/disposeAndRemove (packages/core/src/removal.ts; wired into @if/@switch/@for in view.ts; exported via core/internal). Added ui-presence (usePresence, UiPresence, PRESENCE_ENV, delayHidden) in packages/ui-primitives/src/presence.ts and made Dialog content/backdrop delay hidden until exit completes. Tests: packages/testing/src/removal.test.ts, ui-primitives presence.test.ts (in-memory) and presence.dom.test.ts (jsdom) cover enter, exit with/without animation, disposal during exit; full suite green, tsc clean. Limits listed in notes.
<!-- SECTION:FINAL_SUMMARY:END -->
