---
id: TASK-56.8
title: 'Designer: implement the Claude Design UI (8 boards)'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T06:27:00Z'
updated_date: '2026-11-07T07:25:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.6
parent_task_id: TASK-56
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the redesigned Designer shell UI. Design: https://claude.ai/artifact/1pYK3SirC9ShZsqXauGkK4 (canvas of 8 boards: Main, Page, Frames, Style, Drawer, Dialogs, States, System; shared stylesheet project/designer.css; read with the Artifact tool). Builds on the merged shell (56.3-56.7) in packages/designer/shell, using gable-ui components; Designer-specific tokens (--sel, ok/warn/err tints, canvas dot grid) scoped to the shell only. Webview-safe CSS only (flex, grid, variables, transforms; no backdrop-filter, container queries, view transitions). Known gable-ui gaps may block: text input with clear, swatch/scale picker, route tree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Design tokens: light and dark chrome mapped onto gable-ui variables, plus --sel and ok/warn/err tints scoped to the shell (board 8)
- [x] #2 Top bar, Component mode layout: mode and Select/Interact segments, undo/redo, connection status, command palette, Structure/Insert tabs, Scenarios list, bottom crumb (board 1)
- [x] #3 Page mode layout with route tree and URL bar, light chrome (board 2)
- [x] #4 Multi-Frame canvas: frame headers, device toolbar with env toggles, hover/selection overlays, handles, size badge, floating action toolbar, Inspector (board 3)
- [x] #5 Tailwind Style panel: breakpoint and state segments following the frame, grouped property controls, class chips with new/inherited/override markers (board 4)
- [x] #6 Bottom drawer: Code with applied patch and Undo, Problems, HMR timeline, Accessibility, with badges (board 5)
- [x] #7 Dialogs and flows: open project, connect to dev server, extract component, create Scenario, add/edit Route, binding picker (board 6)
- [x] #8 Empty, error and read-only states, read-only shown amber with reason, unavailable-on-OS tooltips (board 7)
- [x] #9 Keyboard: every control has a palette command and visible focus ring; panel sizes remembered
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Install gable-ui toast/virtual-table/breadcrumb; shell tokens in shell.css mapped onto gable-ui variables (light+dark), --sel and ok/warn/err tints.
2. ChromeState service: theme, tabs, drawer, dialogs, panel layout persisted through per-project settings (additive ProjectSettings.chrome).
3. Top bar, three-pane layout, Structure/Insert/Routes left tabs, Style/Content/Inspector right tabs, crumb, device toolbar + env row, frame headers.
4. Bottom drawer: Code, Problems, HMR timeline, Accessibility, HTTP. Agent overlay restyled (tag, handles, size badge, floating toolbar through additive protocol message).
5. Dialogs: open project, connect, extract component, new Scenario, add/edit Route, binding picker; command palette listing every action.
6. Empty/error/read-only states, honest unavailable states where no backend exists.
7. Update e2e scripts + README; verify tsc, build, vitest, light/dark screenshots.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification: tsc, typecheck:tests and the designer build clean; vitest 144 files, 1330 tests pass. Driven in headless Edge: chrome-check and tailwind-check on ui-gallery pass on the final code. tailwind-check --off and device-check (with and without CDP) on todomvc passed before the last palette patch and were not rerun; device-check needed todomvc's deps, junctioned temporarily and removed. Light and dark screenshots reviewed.

Criteria met through an honest unavailable state, as the brief allows: AC6 Code shows the applied patch's label, file, state and Undo, not its diff (the backend does not return one); AC6 Accessibility has no checks; AC7 open project, extract component and create Scenario show the real part with the action disabled.

AC9 reading: every control outside a modal has a command that runs it or moves to it; modal fields and an open picker's options are reached through the command that opens them, not one command each. A sample of commands is driven by chrome-check, not all of them.

Renames: Tailwind tab to Style, Edit tab to Content, "Connected · ready" to "Connected", HTTP moved to the drawer, PageBar removed, Remove frame replaced by per-frame Close.

Not exercised: Tauri/WebView2 window, Disconnected failure card, dynamic-class read-only callout, toast Undo. gable-check reports one error in the registry-installed toast.ts ((dismiss) on li), left unedited.

The task file was copied into this worktree so the CLI works; it collides with the untracked copy in the main checkout on merge until that copy is removed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rebuilt the Designer shell to the Claude Design's 8 boards with gable-ui components and shell-scoped tokens: top bar, Structure/Insert/Routes, multi-frame canvas with device bar and selection chrome, Style/Content/Inspector, bottom drawer, dialogs, empty/error/read-only states, command palette (Ctrl K), and panel sizes, drawer and theme remembered per project.

Verified: tsc, build, vitest 1330 tests, chrome-check and tailwind-check driven in headless Edge, light and dark screenshots. device-check was not rerun after the last palette patch, and the Tauri window was not run.

Surfaces with no backend say so instead of faking data: accessibility checks, open project, extract component, create Scenario, patch diff. Those are the main follow-ups; the implementation notes list the rest of the limits.
<!-- SECTION:FINAL_SUMMARY:END -->
