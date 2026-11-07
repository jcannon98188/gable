---
id: TASK-26
title: 'First gable-ui components: Button, Dialog, Popover, Tabs, Tooltip, Select'
status: In Progress
assignee:
  - '@claude'
created_date: 2026-11-07 02:24
updated_date: '2026-11-07T03:13:00Z'
labels:
  - ui
  - ready-for-agent
dependencies:
  - TASK-25
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Styled components in the shadcn style (Tailwind, class-variance-authority equivalents as computed view models because templates cannot call functions, tailwind-merge, clsx, lucide). Includes data-state styling for enter and exit animation. Browser look and feel needs a human check at the end. Select may be blocked by the items research task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Six components implemented with tests on the in-memory renderer
- [ ] #2 An example app in examples/ shows them all, with Tailwind working under HMR
- [ ] #3 User has checked animation, focus rings and positioning in a real browser
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add popover, tooltip, select primitives plus machineState to ui-primitives. 2. Build packages/ui (cn/variants/icon helpers, six components, tests in memory and jsdom). 3. theme.css, pack-local support for private gablePack packages. 4. examples/ui-gallery. 5. Docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design: new package packages/ui (@gable/ui, private, gablePack flag so scripts/pack-local.mjs packs it). Primitives added in ui-primitives: machineState(prefix, machine, connect), PopoverState, TooltipState, SelectState and their part directives (deps @zag-js/popover and @zag-js/tooltip ^1.47). Projected children cannot inject the host state, so Dialog trigger, Popover trigger and ui-tab use an owner push (contentChild/contentChildren plus an effect that sets child.owner). Tooltip is a [uiTooltip] directive that builds its positioner and panel in renderer.overlayRoot() imperatively. Select options are data (items input, @for rows with [uiSelectItem], computed view-model rows). Variant classes are computed fields; variants() is a small cva; classes merge with tailwind-merge. Icons: vanilla lucide through a svg[uiIcon] directive and an ICONS registry. Styling: shadcn neutral variables in packages/ui/theme.css, tw-animate-css classes on data-state; exit animation relies on usePresence/delayHidden. Test helper additions: scrollTo/scrollIntoView no-ops in the in-memory test DOM and jsdom. Template limits hit: no arrow functions, no || in templates (use methods and computeds). Tests: in-memory per component (button 4, dialog 4, popover 3, tabs 5, tooltip 2, select 4), jsdom overlays.dom.test.ts (7: dialog open/focus/Escape/outside/exit animation, popover Escape and outside press, select keyboard and click, tabs) and tooltip.dom.test.ts (3); gallery test 3. Full npx vitest run: 628 pass, 1 flaky failure in packages/renderer-dom/src/platform.test.ts (20ms history timing under load; passes alone, unrelated). Root npm run build passes. Gallery: pack:local, npm install, npm run build, npm test, npm run check (tsc + gable-check) all clean; built CSS contains the animate-in, bg-popover and ring-ring utilities. Not verified: Tailwind under the running dev server HMR (AC2 left unchecked) and real browser animation, focus rings and positioning (AC3). Note: the Zag positioner is not used for Dialog (content is fixed-centered like shadcn).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the six gable-ui components (Button, Dialog, Popover, Tabs, Tooltip, Select) in packages/ui with shadcn-neutral styling, new Zag-based popover/tooltip/select primitives and machineState in ui-primitives, theme.css, pack-local support for private packages flagged gablePack, examples/ui-gallery, and docs in docs/ui-primitives.md. Verified by in-memory and jsdom tests, root build, and gallery build/test/check. Remaining for the user: run the gallery (from the repo root: npm run pack:local examples/ui-gallery; cd examples/ui-gallery; npm install; npm run dev) and check animation, focus rings and positioning in a real browser (AC3), and confirm Tailwind under dev-server HMR (AC2). Known limits: Zag effects are off in the in-memory renderer so interactions are tested in jsdom; one unrelated timing-flaky test in renderer-dom platform.test.ts under full-suite load.
<!-- SECTION:FINAL_SUMMARY:END -->
