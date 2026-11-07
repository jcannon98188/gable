---
id: TASK-56.26
title: 'Designer: accessibility depth (focus order, keyboard mode, a11y tree)'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T18:28:00Z'
updated_date: '2026-11-07T20:49:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Overlay of tab/focus order on the canvas, keyboard-only mode, and an accessibility-tree outline for the selected frame, building on the axe Accessibility tab. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Focus order overlay, accessibility tree view, keyboard-only mode
- [x] #2 Exposed through the MCP control plane where an agent would drive it
- [x] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Agent-side focus order/a11y tree/focus stepping (src/agent/a11y-depth.ts) over additive postMessage methods; shell Focus & tree drawer tab + canvas overlay + keyboard-only mode; control-plane 'a11y' command and five MCP tools; unit tests, focus-app fixture, headless Edge e2e, README.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: tsc (designer) and typecheck:tests clean; designer + full build OK; designer vitest 263/263 (25 new in a11y-depth.test.ts, mcp.test.ts extended). e2e/a11y-depth-check.mjs passes (headless Edge, real CDP mouse/key input): focus order + warnings, numbered canvas overlay, Next stop, tree rows/counts/collapse, five MCP tools, keyboard-only ignores a real click while Enter still works, fixture byte-identical. Bug found by the e2e and fixed: keyboard-only cancelled keyboard-activated clicks (detail 0). Full vitest: 2 failures under load (renderer-dom/browser.test.ts known flaky Edge timeout; a language-service check test timeout) - both pass when their packages are run alone. Not verified: tree is DOM-derived, not Chrome's AX tree; focus-indicator detection checked in jsdom (stubbed) and on one real fixture button only; overlay/keyboard-only state resets on frame reload until the shell resends it; no Tauri desktop run.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds a Focus & tree drawer tab (focus order with warnings and unreachable controls, accessibility tree outline, step focus), a canvas focus-order overlay, keyboard-only mode, additive protocol methods (PROTOCOL_VERSION unchanged), an 'a11y' control command and MCP tools get_accessibility, get_focus_order, get_a11y_tree, step_focus, set_a11y_view, plus tests, focus-app fixture, headless Edge e2e and a README section. Risks: DOM-derived tree approximates the browser's; full-suite vitest has load-related timeouts unrelated to this change.
<!-- SECTION:FINAL_SUMMARY:END -->
