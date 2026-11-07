---
id: TASK-56.20
title: 'Designer: record and replay mock data, network conditions'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T18:28:00Z'
updated_date: '2026-11-07T19:16:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Page mode: record real dev-API responses into mockHttp scenarios, edit them, and switch a frame to slow, 500 or offline. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Record real responses into a mock scenario; per-frame slow/error/offline conditions
- [x] #2 Exposed through the MCP control plane where an agent would drive it
- [x] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Agent (src/agent/network.ts): wrap fetch/XHR before the app runs, log requests (method, url, status, timing, size, initiator), skip Vite/Designer internals; per-frame condition (normal/slow/error/offline, match) kept in sessionStorage so reloads keep it; recording keeps API response bodies (capped; fetch bodies buffered while recording).
2. Protocol (additive, PROTOCOL_VERSION unchanged): network, setNetworkCondition, record, recording methods; an activity message for live updates.
3. Mocked requests (vite-plugin MOCK_LOG hook) are logged and honour the frame's condition too.
4. CDP: whole-frame offline via Network.emulateNetworkConditions composed with the throttle profile; POST /api/network/offline in new network-api.ts; labelled unavailable without CDP.
5. Edit ops (src/server/edit/mocks.ts): addMockScene (recorded mocks written as a minimal patch with undo), setMock, removeMock; GET /api/mocks reads a scenes file's literal mocks.
6. MCP (src/server/mcp/network-tools.ts): get_network, set_network_condition, record_http, get_recording, save_recording_as_scenario, list_mocks, edit_mock, remove_mock; shell command 'network' via a new NetworkState.
7. Shell: network-state.ts + network-panel.ts replace the drawer HTTP panel body (log, condition, record, save as Scenario, mocks list with edit/remove).
8. Fixture test-fixtures/net-app with a real dev API middleware; unit tests; e2e/network-check.mjs headless Edge (with and without CDP); README section.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Debugging the e2e found two real bugs, both fixed:
- The core Http client aborts its request controller once it has read the body, which cut short the agent's clone read, so the fetch response was logged but never recorded (entry error 'body: signal is aborted without reason'). While recording, the agent now reads the body in full before handing the app a copy (url/redirected/type kept); otherwise an AbortError after the app's read is no longer reported as an error. Unit test added.
- Two condition fields edited quickly (status, then match) each patched a stale condition and the second undid the first. NetworkState.setCondition now queues changes per frame, each on the condition the previous one left.
Verification: tsc (designer) clean; npm run typecheck:tests clean; designer build OK; vitest 1615/1616: the one failure is renderer-dom/browser.test.ts, the known flake, which also failed when run alone and failed on a clean HEAD checkout too (passed there once), and no core/renderer-dom files are changed; network.test.ts 17/17; node e2e/network-check.mjs and --no-cdp: all checks passed (headless Edge, the backend with and without CDP, fixture byte-identical at the end).
Limit (documented in README): a Scenario's mocks answer only requests made through @gable/core/http Http; a recorded raw fetch/XHR becomes a mock but the raw call still goes to the network.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Network panel for the Designer (drawer HTTP tab): the Preview agent wraps fetch/XHR and logs each API request (status, time, size, type, initiator, condition), applies per-frame conditions kept across reloads (slow, server error, offline incl. navigator.onLine; whole-frame offline over CDP in WebView2/CDP browsers, labelled unavailable elsewhere), and records real responses. Save as Scenario writes them as a new scene of a *.scenes.ts file through the edit service (addMockScene: one minimal insertion with undo, ADR 0001; nothing held by the Designer); the active Scenario's mocks can be edited/removed in place (setMock/removeMock). Protocol additions are additive (PROTOCOL_VERSION unchanged). MCP: get_network, set_network_condition, record_http, get_recording, save_recording_as_scenario, list_mocks, edit_mock, remove_mock. Tests: src/network.test.ts (17), e2e/network-check.mjs on test-fixtures/net-app (with and without CDP) pass; tsc, typecheck:tests, build pass; full vitest passes except the known renderer-dom browser.test.ts flake (also fails on clean HEAD). Limit: Scenario mocks only answer requests made through @gable/core/http's Http client; raw fetch/XHR recordings become mocks but raw calls still hit the network. The drawer tab is still labelled HTTP (TASK-56.21 relabels it).
<!-- SECTION:FINAL_SUMMARY:END -->
