---
id: TASK-56.10
title: 'Designer: Scenario writer and extract-component flows'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T15:19:00Z'
updated_date: '2026-11-07T16:13:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.8
parent_task_id: TASK-56
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-56.8. The Create Scenario and Extract component dialogs render but their actions are disabled. Implement the backend source writers (minimal patches per ADR 0001): append a scenario to the *.scenes.ts file; extract repeated classes/markup into a component.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Create Scenario dialog writes a scene to the component's scenes file and it appears in the Scenarios list
- [x] #2 Extract component dialog creates the component file and replaces the source with its usage, undoable as a reverse patch
- [x] #3 Tests added; tsc, designer build and full vitest pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. History: generalise EditService entries to several files (a created file is undone by its reverse patch and then removed; redo re-creates it). All files of an entry are located before any is written, so undo/redo stays all-or-nothing.
2. Scenario writer (server/edit/scenario.ts): op addScene {file, name, description?, from?}. The TypeScript parser finds the default export's scenes object; the new scene is a text insertion after the last scene (keeps trailing comma, indent, quote style). from copies an existing scene's initializer text and sets its description. Refuses duplicates, unsafe names, files that are not *.scenes.ts.
3. Extract component (server/edit/extract.ts): op extract {target, name, all?}. template-format positions find the element; only static markup is extracted (bindings, events, refs, blocks, interpolations refused with the reason). Writes <kebab>.ts beside the source (new file, html import spec and quotes copied from the source, child components imported from the palette's selectors, template formatter-clean), replaces the element (and, with all, identical copies in the same template) by <app-kebab></app-kebab>, imports the class and lists it in meta imports. One history entry over both files. describe() reports whether the element can be extracted and how many identical copies there are.
4. Shell: Dialogs call EditState with the ops; New Scenario gets description and start-from fields and mounts the new scene once it is listed; Extract shows the selector, file, copies checkbox and refusal reason. README updated.
5. Tests in src/edit.test.ts (scenario writer, extract, multi-file undo/redo, conflicts); tsc, build, vitest; drive both dialogs in headless Edge against examples/todomvc with a node script that spawns and kills only its own processes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tests ended up in packages/designer/src/source-writers.test.ts (11 tests: scenario writer output/undo/redo/copy/quoted names/single-line + empty objects/CRLF/refusals; extract kebab names, describe check + copy count, exact created file, formatter-clean template, source replacement + import + meta imports, multi-file undo removing the created file byte-for-byte, redo, all copies, refusals, scoped-styles note, undo conflict when the created file was edited).
Verification: npx tsc -p packages/designer/tsconfig.json --noEmit clean; npm run build -w packages/designer OK; full npx vitest run 168 files / 1485 tests passed (a later rerun hit one flaky renderer-dom browser test under machine load; it passes alone and is unrelated). Driven check packages/designer/e2e/writers-check.mjs (spawns the built Designer on examples/todomvc + headless Edge, stops only its own process trees with taskkill /T, snapshots and restores the project): 23/23 PASS, covering both dialogs, the Scenarios list, mounting, exact file text, the dynamic-markup refusal, canvas HMR, and Ctrl+Z restoring files byte for byte and removing the created component.
Environment notes: examples/todomvc needs its own deps (todomvc-common, todomvc-app-css) - copied into the worktree's gitignored node_modules from the main checkout; an interrupted run had left a zero-filled Vite deps cache (examples/todomvc/node_modules/.vite) that kept the agent from connecting - deleted.
Shell hardening: EditState.#reselect bounds each preview call (1s) - a call to a frame that reloaded on its own is never answered and would leave the edit busy for good. Closed ui-dialogs keep their content in the DOM, so the check tests visibility.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
New Scenario and Extract component now write source through the edit API as minimal patches with one undo step each (ADR 0001).

- addScene (server/edit/scenario.ts): inserts a scene into the default export's scenes object of a *.scenes.ts file, keeping indent, trailing comma and quote style; can start as a copy of an existing scene with a new description; refuses duplicates and unsafe names.
- extract (server/edit/extract.ts): moves a static element (refuses bindings, events, refs, blocks, interpolation, i18n and @let, with the reason) into <kebab>.ts beside the source as a formatter-clean component, replaces it (optionally all identical copies) with <app-kebab></app-kebab>, imports the class and lists it in meta imports. describe() reports extractability and copy count.
- EditService history entries span several files: all are located before any is written; undo of a created file removes it, redo re-creates it.
- Shell: both dialogs are live (name/description/start-from for Scenarios, mounting the new scene once listed; file/usage/copies/reason for Extract); the toast lists created files and notes (e.g. scoped styles not moved).

Verified: tsc clean, designer build, full vitest (1485 tests), 11 new unit tests, and the new driven Edge check e2e/writers-check.mjs 23/23.
Follow-ups: attribute-selector hosts for li/tr extraction; extracting dynamic markup as inputs; creating a scenes file for a component without one; chrome-check/device-check and the Tauri window were not rerun.
<!-- SECTION:FINAL_SUMMARY:END -->
