---
id: TASK-56.9
title: 'Designer: patch diff and accessibility checks'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T15:19:00Z'
updated_date: '2026-11-07T16:01:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.8
parent_task_id: TASK-56
ordinal: 147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-56.8. The Code drawer shows only the patch label/file/state; the Accessibility tab says it has no checks. Backend must return the applied patch diff, and the Preview agent must run a11y checks (e.g. contrast, missing labels/alt, roles) and report them over the protocol.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Code tab shows the real unified diff of the last applied patch, with Undo
- [x] #2 Accessibility tab lists checks from the Preview agent with element link and badge count; selecting a row selects the element
- [x] #3 Tests added; tsc, designer build and full vitest pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend: src/server/edit/diff.ts makes a line-level unified diff (Myers, 3 lines of context, a/ b/ headers, LF-normalised) of each write. EditService stores it on the history entry at commit and redo; HistoryInfo gains last: { id, label, file, stale, diff } for the top of the undo stack (only that one is sent).
2. Protocol: additive agent method a11y (params { rules off for component mode decided by agent }, result A11yReport: engine+version, url, checks[] with rule, impact, kind violation|review, help, helpUrl, summary, html, selector, node {id, tag, component} | null). PROTOCOL_VERSION stays 1 (additive, as setPreview); README says so.
3. Agent: loads axe-core lazily from /__gable-designer/axe.js (the Designer's Vite plugin serves axe.min.js wrapped as an ES module from the Designer's own dependency), runs it with elementRef excluding the overlay layer, maps each element to its template node via the designer hook. Component mode turns off page-level rules.
4. Shell: a11y-state.ts (root service) runs checks on the selected frame when it connects and after tree/hmr/router changes (debounced) and on Re-run; drawer Accessibility tab lists rows (impact, rule, element link, message), clicking selects the element (selectNode); tab badge = violation count. Code tab renders the diff with +/- line colours and keeps Undo/Redo.
5. Tests: diff unit tests, EditService history.last after apply/undo/redo, CRLF; a11y mapping of an axe result (pure function) under jsdom with axe-core; plugin serves axe module. Run tsc, build, vitest, and a headless Edge driven check (a11y-check.mjs) that spawns the server and kills only its own processes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diff: src/server/edit/diff.ts (Myers line diff after trimming common head/tail, falls back to one replacement past 4000 edits; 3 lines context; LF-compared). EditService keeps it per history entry (computed at write and at redo; undo keeps the entry's diff) and HistoryInfo.last carries only the top entry's diff. Code tab renders it with old/new line numbers, +/- colours, and Undo/Redo.
A11y: chose axe-core over hand-written rules (already used by @gable/testing/a11y; real contrast in the browser). Added as a designer dependency (lock: same 4.14.0, devOptional flag dropped). Vite plugin serves axe.min.js + 'export default globalThis.axe' at /__gable-designer/axe.js; agent loads it lazily, hides its overlay during runs, queues runs, maps each element via designer.nodeOf. Component mode disables document-level rules. Protocol: additive 'a11y' method + A11yReport/A11yCheck types, PROTOCOL_VERSION stays 1 (same convention as setPreview).
Shell: a11y-state.ts (root) re-runs on connect/tree/hmr/router (700ms debounce) and Re-run; a failed run clears the report rather than showing a stale one. Accessibility rows: impact, rule + help + axe summary, element link (<tag> in Component), row click selects, hover outlines, aria-current marks the selected one; tab badge = violation count (red if serious/critical).
Fixture test-fixtures/a11y-app (inaccessible on purpose) + e2e/a11y-diff-check.mjs that spawns backend and headless Edge itself and kills only its own PIDs' trees (taskkill /T on those PIDs). chrome-check's old 'not available' assertion updated (not rerun: ui-gallery deps not installed in this worktree).
Verified: tsc designer, typecheck:tests, designer build, vitest 169 files / 1489 tests, a11y-diff-check 14/14 PASS (run twice), no leftover processes, fixture byte-identical afterwards.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Code tab now shows the real unified diff of the last applied patch (git-style hunks, old/new line numbers, +N -N counts) with Undo/Redo; the diff is computed server-side by a Myers line diff in src/server/edit/diff.ts and carried as HistoryInfo.last. Accessibility tab lists axe-core 4.14 checks run by the Preview agent inside the real page (new additive protocol method a11y, PROTOCOL_VERSION unchanged; axe served by the Designer's Vite plugin), each row with impact, rule, explanation and an element link to its template node; clicking a row selects the element, and the tab badge counts violations. Checks re-run on connect, HMR, navigation, tree change and Re-run. Tests: patch-diff.test.ts (diff format plus 200 random edits verified by applying the diff, EditService history.last across apply/undo/redo/CRLF) and a11y.test.ts (real axe-core in jsdom, overlay exclusion, page vs component rules, sorting, axe module serving). Verified: designer tsc, typecheck:tests, designer build, vitest 169 files / 1489 tests, and e2e/a11y-diff-check.mjs (spawns its own backend and headless Edge on test-fixtures/a11y-app, kills only those) 14/14 PASS. Not verified: chrome-check.mjs rerun (ui-gallery deps not installed here), the Tauri window. Follow-ups: open axe helpUrl externally from Tauri; document-level rules have no element link; checks cover only the selected frame and do not re-run on signal-only state changes (Re-run covers it).
<!-- SECTION:FINAL_SUMMARY:END -->
