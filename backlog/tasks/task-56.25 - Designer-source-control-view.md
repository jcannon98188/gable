---
id: TASK-56.25
title: 'Designer: source control view'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T18:28:00Z'
updated_date: '2026-11-07T20:48:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.9
parent_task_id: TASK-56
ordinal: 173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Show changed files with grouped diffs, commit a selection, revert one visual change or file, using git via the backend. Render diffs with the new gable-ui syntax/diff renderer (being added by the user) instead of the Designer's own diff view. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Changed-files view with diffs rendered by gable-ui; commit and revert from the Designer
- [x] #2 Exposed through the MCP control plane where an agent would drive it
- [x] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend GitService (src/server/git.ts): status, per-file diff split into hunks, commit a path selection, revert a file or one hunk with an in-memory undo stack; all via git CLI, only paths currently changed are accepted. 2. HTTP /api/git/* (git-api.ts) + broadcast of a 'git' event on the existing SSE stream. 3. MCP tools get_changes, get_file_diff, commit_changes, revert_changes, undo_revert. 4. Shell: gable-ui code-block (+diff/highlight libs) copied with the CLI; drawer 'Changes' tab with grouped files, selection, per-hunk diffs rendered by ui-code-block, commit box, revert (confirm) and undo revert. 5. Tests (pure helpers, temp-repo service tests, MCP), e2e script git-check.mjs, README section.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: backend GitService (src/server/git.ts, git CLI via execFile, --literal-pathspecs, project may be a repo subfolder), HTTP /api/git/* (git-api.ts), MCP tools get_changes/get_file_diff/commit_changes/revert_changes/undo_revert (mcp/git-tools.ts), shell Changes drawer tab (changes-state.ts, changes-panel.ts) refreshing over the existing SSE stream via a new additive 'git' event (no new EventSource, PROTOCOL_VERSION unchanged). Diffs render with gable-ui ui-code-block (copied via the gable-ui CLI: code-block, diff, highlight); the Code tab's last-patch diff now uses it too (a11y-diff-check.mjs reads the new markup). Reverts are kept in an in-memory undo stack (20). Checkbox note: ui-checkbox needs [(value)] with a settable function, (valueChange) is not an output. Layout fix: .chg-files min-height so the list is not squeezed under the commit box in a short drawer. Verified: tsc clean; npm run typecheck:tests clean; designer build ok; full vitest 192 files / 1727 tests pass; git-check.mjs (headless Edge, throwaway repo) all checks pass; a11y-diff-check.mjs passes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a Changes drawer tab (source control): grouped changed files, per-hunk diffs rendered by gable-ui ui-code-block, commit of a ticked selection, revert of a hunk or file with confirmation and in-memory Undo revert. Git runs in the backend (GitService + /api/git/*); the shell refreshes over the existing event stream (additive 'git' event; PROTOCOL_VERSION stays 1). MCP tools: get_changes, get_file_diff, commit_changes, revert_changes, undo_revert. README section and e2e/git-check.mjs added; Code tab diff migrated to the gable-ui renderer. Verified: tsc, typecheck:tests, designer build, full vitest (1727 pass), git-check.mjs and a11y-diff-check.mjs in headless Edge. Not verified: the Tauri desktop window, conflicted-file behaviour, the --index fallback of hunk revert beyond unit tests; undo is in-memory only (lost on backend restart).
<!-- SECTION:FINAL_SUMMARY:END -->
