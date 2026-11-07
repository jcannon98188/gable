---
id: TASK-56.18
title: 'Designer: signal time travel'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T18:28:00Z'
updated_date: '2026-11-07T19:26:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.17
parent_task_id: TASK-56
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Record signal updates per frame (bounded ring buffer) from the devtools hook and let the user scrub back and forward through states, applying them to the live frame; timeline lives in the drawer next to HMR. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Recorded state history with scrub, replay and clear; applying a past state updates the frame
- [x] #2 Exposed through the MCP control plane where an agent would drive it
- [x] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Core (dev-only): signals.ts tells the devtools sink a state node is about to be written (willWrite, only while recording; dropped in production). New core/src/signal-history.ts: steps of writes grouped per microtask (before/after by reference, equal writes dropped), ring-buffered (300 steps, 2000 writes); travel to any step computes each touched signal's value at that step and writes it (models through their setter), muting the app's derived writes until the next macrotask; clear; Designer writes (setSignal) recorded as their own steps.
2. Devtools methods (additive): history, recordHistory, travel, clearHistory; event history (per step). The Preview agent forwards devtools methods and events already; it turns recording on at connect.
3. Shell: drawer 'State' tab next to HMR in a new file (signal-timeline.ts + service): step list, gable-ui slider to scrub, replay (from the cursor, timed), clear, record toggle; selecting a step travels the frame. Minimal drawer.ts edit.
4. MCP (signal-tools.ts or a new file): get_signal_history, travel_signal_history, clear_signal_history.
5. Tests (core recorder, agent/MCP), README, headless Edge e2e (e2e/timeline-check.mjs on test-fixtures/state-app).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Steps commit on setTimeout(0), not a microtask: microtask grouping split a handler's writes from its effects' answers depending on order. One task (and its microtasks) is one step; timers due at once may share a step (documented, e2e tolerant).
Only app state is recorded: signals that are fields of a component or of a resolved service (injector entries). The framework's own signals (@for row item/count) were first recorded as unnamed 'state #N' steps and travelling them would desync a list; describe() now returns null for them and for anonymous locals.
Shell: SignalTimeline service (signal-timeline-state.ts) + SignalTimelineTab (signal-timeline.ts), 'State timeline' drawer tab after HMR and a palette entry. Replay goes from the cursor (or the start) to the newest step, 500ms per step, stoppable.
gable-ui gaps (TODO(gable-ui)): ui-slider has no label input; the slider machine starts in Setup before the template renders, so Zag never measures the thumb and keeps it visibility:hidden (unfocusable, invisible). Worked around in the copied components/ui/slider.ts by passing thumbSize 16x16 (size-4) for ui-slider and ui-range-slider.
Control channel: history command (report/travel to step|start|live/clear/record) via the tab's service so the drawer shows agent actions. MCP (server/mcp/history-tools.ts): get_signal_history, travel_signal_history, clear_signal_history, record_signal_history.
renderer-dom/browser.test.ts flakes the same with HEAD's signals.ts (1 of 2) and with this change (2 of 4), so it is the known flake.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Signal time travel in the Designer.

- Core (dev-only, gated on DEV and recording): signal() and state sources tell the devtools sink before a write. New signal-history.ts records steps (one task's writes with before/after, effects included; equal writes dropped) in a ring buffer: 300 steps, 2000 writes, 500 per step. Travel restores each recorded signal's value at a step (models through their setter, the app's derived answers muted), counting destroyed components' signals as gone. Designer writes (setSignal, so Set and Pin) are their own steps. Only fields of components and services are recorded.
- Devtools methods history, recordHistory, travel, clearHistory and a history event; the control channel gained a history command. All additive, PROTOCOL_VERSION unchanged. The Preview agent turns recording on at connect.
- Shell: a 'State timeline' drawer tab next to HMR (and in the palette) with a newest-first step list, a gable-ui slider to scrub, Replay/Stop, Live, Pause/Record and Clear, plus notes for gone or incomplete travels and dropped steps.
- MCP: get_signal_history, travel_signal_history (step, start, live), clear_signal_history, record_signal_history.
- README section 'State timeline (signal time travel)'.

Verification: 11 core recorder tests and 5 MCP tool tests. tsc (designer), typecheck:tests, gable-check 0 errors and designer build pass. Full vitest: 1636 pass, 1 fails, the known renderer-dom browser flake, which flakes equally with HEAD's signals.ts. e2e/timeline-check.mjs (headless Edge, 24 checks) passes, and e2e/state-check.mjs (TASK-56.17) still passes.

Not verified: the Tauri/WebView2 window, and long sessions near the buffer bounds in a real app (covered by a unit test only).
Follow-ups: gable-ui slider gaps (thumb label input; the machine starts before render so the thumb is never measured, worked around with thumbSize). Possibly also record/travel router state, and an export of a timeline as a Scenario.
<!-- SECTION:FINAL_SUMMARY:END -->
