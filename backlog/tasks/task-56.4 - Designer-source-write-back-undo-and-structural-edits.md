---
id: TASK-56.4
title: 'Designer: source write-back, undo and structural edits'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:57:00Z'
updated_date: '2026-11-07T05:46:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.3
parent_task_id: TASK-56
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Visual edits must land as small reviewable text patches so code and designer stay interchangeable, which is the core of the source-of-truth decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A dev-server endpoint applies minimal patches to template text, static meta and CSS, and HMR updates the canvas
- [x] #2 Text, attribute and binding edits work, with a binding picker listing existing typed signals
- [x] #3 Insert from a palette of gable-ui and project components, move, delete, and wrap in @if/@for
- [x] #4 Undo and redo apply reverse patches, including after external edits to the file are detected
- [x] #5 Edits keep the repo formatter output so diffs stay clean
- [x] #6 Dynamic expressions and bindings the designer cannot edit safely are displayed read-only and are never rewritten
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. template-format: give the lossless Parser source offsets on every item (elements: start/openEnd/end, attributes: name/value ranges; words; blocks with head and body ranges) and export it as parseTemplateTree. It is the position authority; the runtime node pos is only a handle (verified by offset+tag, ordinal reported) so the two parsers cannot drift. Parse raw LF text (CRLF mapped by SourceText; escapes flagged).
2. packages/designer/src/server: edit engine (pure functions on file text): locate literal by content (refuse ambiguous), node model/describe (static attrs editable; bindings/events/models/interpolations/i18n read-only), ops: setText, setAttr, removeAttr, addBinding/addTextBinding (picker expressions only, simple signal reads), insert (palette snippet + meta.imports + import decl), move, delete, wrap @if/@for, setMeta string, CSS declaration patch. Formatter: if the literal was formatter-clean before, reformat the literal with formatTemplateLiterals (repo output), else format only the inserted snippet at local indentation; project prettier options read when present.
3. History: reverse patches (hunks with context + hash); undo/redo detect external edits by hash, relocate hunks by context or refuse with a conflict, file watcher emits external-edit events (own writes ignored).
4. Backend endpoints in backend.ts (/api/edit/describe, apply, undo, redo, palette, history) behind token+Host; writes the file so the project's Vite HMR updates the canvas.
5. Shell: new edit-state.ts + edit-panel.ts (Edit tab: text, attributes, binding picker from component signals, palette, move/delete/wrap, undo/redo with Ctrl+Z/Y); tiny change in shell.ts to add the tab. Reselect the edited node after HMR.
6. Tests (vitest: ops, formatter parity, undo with external edit, CRLF, escapes, read-only, backend endpoints) plus a driven run in headless Edge over CDP against examples/todomvc. Docs: README, GLOSSARY if needed, notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built: position-tracking parser in @gable/template-format (parseTemplateTree: offsets for elements, attrs, values, quotes) is the position authority; runtime pos is only a handle (TargetRef = raw + offset + tag, verified, stale refused). Edit engine in packages/designer/src/server/edit (template.ts ops+validators, hunks.ts reverse patches with context relocation, css.ts, meta.ts, palette.ts, service.ts). /api/edit/{describe,apply,undo,redo,history,palette}. Shell: Edit tab (edit-state.ts, edit-panel.ts). Formatter: formatter-clean templates are reformatted whole with project prettier options, others touched only at the edit. Evidence: vitest (designer 30, template-format 33) and a driven run in headless Edge over CDP against a copy of examples/todomvc (real backend, project Vite, HMR): panel text edit, external edit detected, undo/redo relocated, insert/wrap/move/delete, read-only refusal, CSS patch. Not covered by the driven run: setMeta, binding/attr via panel UI (unit tests only), formatter parity on a clean template (unit tests only; todomvc template was not clean). Limits: escaped or duplicate-literal templates refused; no event-handler editing; no cross-template move; styles: strings in .ts not editable.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T04:24:00Z

---

Spike finding: the runtime parser only has element positions. Make @gable/template-format lossless parser the position authority (text, attributes, expressions), with the runtime pos as a handle (ordinal in that tree) so two parsers cannot drift. The runtime parser reads cooked strings[0], so backslash escapes shift offsets; CRLF files differ too. Parse the raw string.

---

created: 2026-11-07T05:22:00Z

---

From TASK-56.3 (merged): positions are elements only, no text/attribute ranges. Templates containing escapes are flagged exact:false and not mapped. Identical literals in one file are ambiguous (first taken, flagged). Node ids go stale after an HMR template change and the selection is cleared. Backend (packages/designer) serves its API behind a per-session token and Host check; write-back endpoints belong there.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Source write-back for the Designer: lossless-parser positions, minimal-patch edit engine (text, attrs, bindings, insert/move/delete/wrap, meta, CSS), reverse-patch undo/redo that relocates after external edits and reports conflicts, /api/edit endpoints and an Edit tab. Verified by vitest and a driven headless-Edge run over CDP with HMR. Follow-ups: gable-ui entries not yet installed cannot be inserted; styles strings in .ts; cross-template moves; event handler editing; escaped/ambiguous templates refused; runtime exposes no ordinal so the handle is matched by offset.
<!-- SECTION:FINAL_SUMMARY:END -->
