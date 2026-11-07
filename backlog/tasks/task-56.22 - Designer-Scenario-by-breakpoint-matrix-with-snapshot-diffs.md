---
id: TASK-56.22
title: 'Designer: Scenario by breakpoint matrix with snapshot diffs'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T18:28:00Z'
updated_date: '2026-11-07T20:36:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grid of every Scenario at chosen breakpoints using mountScene and the frame board; save baselines and show visual diffs against them. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Matrix view; save baseline images; diff view highlights changes
- [x] #2 Exposed through the MCP control plane where an agent would drive it
- [x] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend-only headless render (CdpClient + findBrowser) of each Scenario's component-mode URL at each width; no agent protocol change, no new EventSource.
2. MatrixStore: baselines in the Designer data dir; pixel diff (in-house PNG codec) and rendered-markup diff via unifiedDiff.
3. Matrix drawer tab (grid, detail with Diff/Current/Baseline, ui-code-block markup diff); POST /api/matrix.
4. MCP tools through the shell: get_matrix, run_matrix, get_matrix_cell, save_matrix_baselines, forget_matrix_baselines.
5. Unit/MCP tests, e2e/matrix-check.mjs, README section.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Renders happen in the backend with a fresh headless Chromium over CDP, so PROTOCOL_VERSION stays 1 and no EventSource is added. Baselines are stored in the Designer data dir, not the project. Pixel diff uses an in-house PNG codec (pngjs is not a dependency); the markup diff reuses edit/diff.ts unifiedDiff rendered with the ui code-block copied in by the gable-ui CLI. cellText lives in matrix-state.ts so tests need not import the panel's CSS. Verified: tsc, typecheck:tests, designer build, full vitest (191 files, 1729 tests pass), e2e/matrix-check.mjs in headless Edge (all checks pass).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the Matrix drawer tab and five MCP tools (get_matrix, run_matrix, get_matrix_cell, save_matrix_baselines, forget_matrix_baselines). Scenarios render headlessly at configurable breakpoints, baselines save to the Designer data dir, and changed cells show a red pixel diff plus a rendered-markup diff. Tests in src/matrix.test.ts (18), driven check e2e/matrix-check.mjs, README Matrix section.
<!-- SECTION:FINAL_SUMMARY:END -->
