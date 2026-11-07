---
id: TASK-56.17
title: 'Designer: signal state editing and save-as-Scenario'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T18:28:00Z'
updated_date: '2026-11-07T19:03:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inspector can set a signal's value (typed, JSON-validated, reversible) in the selected frame, and pin values; a 'Save as Scenario' action writes the current poked state into the component's *.scenes.ts through the existing Scenario writer. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Set and pin signal values from the Inspector; Save as Scenario writes a working scene
- [x] #2 Exposed through the MCP control plane where an agent would drive it
- [x] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Core devtools (dev-only file, additive): signalJson method returning a signal's value as JSON text when it is plain data (or why not); setSignal unchanged.
2. Scene.state (tooling type, additive): initial values for the mounted component's own writable signals by field name; applied by the Designer's component host and @gable/testing mountScene.
3. designer src/signal-value.ts: typed JSON validation of a new value against the current one (kind, keys, element shape; force overrides) and a TS literal printer in the file's quote style. Unit tests.
4. Protocol (additive, PROTOCOL_VERSION unchanged): agent methods setSignalValue, pinSignal, pins, sceneState. Agent logic in src/agent/signal-state.ts (pins re-applied after flushes, with a fight guard).
5. Scenario writer: addScene gains inputs/state overrides merged into the copied scene as minimal text edits. Tests.
6. Shell: SignalEdits service + Inspector editing UI (edit/pin per writable signal, Poked state section with Save as Scenario) in new files; gable-ui components, TODO(gable-ui) for gaps.
7. Control channel command signals + MCP tools set_signal, pin_signal, save_scenario in src/server/mcp/signal-tools.ts.
8. README section, mcp.test coverage, headless Edge e2e (e2e/state-check.mjs on a new test-fixtures/state-app).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built on what existed: the devtools hook's setSignal/inspect (writable flag), the Inspector's signal rows, EditService addScene, the control channel/ShellBridge and the MCP control server.

- Core (dev-only): devtools signalJson (plain-data JSON or why not: Date/class instance/function/cycle/non-finite); Scene.state typed for the component's public writable signals (models excluded; other names accepted and checked at mount) and applySceneState in @gable/core/tooling, used by the Designer's component host and @gable/testing mountScene.
- Found and fixed a pre-existing core bug in designer.ts: a template node remembered only the first component instance that rendered it, so after a scene remount the Inspector lost the selected element's owner (component null). Now each element maps to its own instance; the node's instance is the latest. Test in designer.test.ts.
- Agent (src/agent/signal-state.ts): checked writes (signal-value.ts: kind, keys, element shape; force overrides), pins re-applied after flush/tree/hmr in a microtask, suspended when the app overwrites more than 20 times in 1s; sceneState reports the mounted component's inputs and writable signals with poked/changed (baseline at mount) and the poked signals a Scene cannot hold (child's, service's).
- Protocol additive (signalJson via devtools, setSignalValue, pinSignal, pins, sceneState); control command signals; PROTOCOL_VERSION unchanged.
- addScene gains inputs/state: minimal edits merged into the copied scene, keeping its layout (single-line or multiline), spread-aware, in the file's quote style. A copy without a typed description drops the source's description (existing behaviour; deliberate here since the copied description usually no longer holds).
- Shell: signal-edits.ts (service) and signal-editor.ts (SignalEdit row control, SceneStatePanel) using gable-ui button/textarea/checkbox/input (textarea and checkbox added with the gable-ui CLI); panels.ts only gains the two tags and a writable field.
- MCP (src/server/mcp/signal-tools.ts): set_signal, pin_signal (by id, or field name on the selection's component / a get_tree id), get_scene_state, save_scenario (diff, undo).

Verification: npx tsc -p packages/designer/tsconfig.json --noEmit clean; npm run typecheck:tests clean (it caught that Scene.state excluded every signal, since input() is structurally a ReadonlySignal: fixed); gable-check 0 errors; designer build ok; full npx vitest run 182 files / 1621 tests pass; node packages/designer/e2e/state-check.mjs (headless Edge on test-fixtures/state-app) all checks pass, three runs in a row.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Inspector can Edit and Pin any writable signal or input of the selected component in the running app: the new value is JSON, checked against the current value's shape (refused with the reasons, then 'Set anyway'), written through the devtools hook, and the frame re-renders. Pins are re-applied after each flush and suspended (with the reason) when the app fights them more than 20 times a second. In component mode a 'Poked state' section lists what was set or changed since the scene mounted, and the signals a Scene cannot hold, and 'Save as Scenario' writes a copy of the mounted scene with the chosen values (new Scene.state for signals, inputs for inputs) as one minimal undoable edit, then mounts it. MCP: set_signal, pin_signal, get_scene_state, save_scenario. Protocol additions are additive; core changes are dev-only (devtools signalJson) or type/tooling-only (Scene.state, applySceneState, honoured by mountScene). Also fixed a pre-existing designer-layer bug that lost a selected element's owner component after a remount.

Verified: tsc, typecheck:tests, gable-check, designer build, full vitest (1621 tests), and e2e/state-check.mjs in headless Edge (Inspector edit/shape refusal/invalid JSON/non-plain value/pin/suspension/unpin/skipped child signal/Save as Scenario writes and mounts/undo; then the four MCP tools on the real app).

Not verified: the Tauri/WebView2 desktop window (only headless Edge). Follow-ups: pins last only for the page session (a reload drops them); Scene.state only reaches the mounted component's own fields, not children or services; the shape check is runtime-based, not the declared TypeScript type.
<!-- SECTION:FINAL_SUMMARY:END -->
