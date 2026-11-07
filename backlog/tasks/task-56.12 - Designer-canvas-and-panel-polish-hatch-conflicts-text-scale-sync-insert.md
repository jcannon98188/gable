---
id: TASK-56.12
title: 'Designer: canvas and panel polish (hatch, conflicts, text scale, sync, insert)'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T15:20:00Z'
updated_date: '2026-11-07T16:24:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.8
parent_task_id: TASK-56
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-56.8. Gaps: no amber hatch/lock for read-only elements on canvas; no Tailwind class conflict callouts or suggestions; no text-scale env control; selection not mirrored across frames (optional sync); no route back/forward buttons; no drag-to-insert from Insert tab; no Fix action in Problems; Structure shows component tree not template outline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Read-only amber hatch on canvas; class conflict callouts with suggestion in Style panel; text-scale control; optional cross-frame selection/interaction sync
- [x] #2 Route back/forward, drag insert from Insert tab, Problems Fix action, template outline in Structure
- [x] #3 Tests added; tsc, designer build and full vitest pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Agent (additive protocol, PROTOCOL_VERSION unchanged): setReadOnly (amber hatch + lock chip on a node), mirror (selection outline of the node at raw/offset, no pick sent back), dropTarget (node + before/after/inside at a frame point, insertion line), text scale in setEmulation (root font-size from the page's own default).
2. Shell: read-only hatch when the selected element is refused or its class list is dynamic; Sync mirrors the selection into the other frames with an 'x selected in n of m frames' chip; Text size select in the environment row (persisted per frame in Emulation.textScale, clamped).
3. Tailwind: TailwindModel.conflicts() (same variants, conflicting claims; winner by the design system's class order) in AnalyzeResult; Style panel callout per conflict with a Remove-the-loser suggestion; palette/option hover shows 'Applying replaces x' from a dry plan.
4. Page mode: shell-side NavHistory (back/forward over router URLs, never iframe history) with buttons in the URL bar.
5. Insert tab: pointer drag of a palette entry onto a frame (agent dropTarget hit test, insertion indicator, ghost chip, Escape cancels), writing the insert relative to the dropped-on node.
6. Problems: analysis carries quick-fix titles (language-service fixes, single-file); /api/diagnostics/fix applies one through EditService history (undoable, refused when the file changed since analysis); Fix buttons in the Problems tab.
7. Structure: /api/edit/outline returns the selected element's template as an outline (elements with tag.class, blocks read-only, interpolations, binding counts); rows select/hover the node on the canvas.
8. Commands for the new controls; README; vitest for conflicts, outline, fixes, nav history, drop placement, text scale; tsc, build, vitest; headless Edge driver.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as planned. Agent: setReadOnly, mirror, dropTarget and textScale in setEmulation are additive (PROTOCOL_VERSION unchanged); pure dropWhere() in protocol.ts.

Backend: TailwindModel.conflictsIn() (mutual conflicts at the same sorted variants, winner by getClassOrder) in AnalyzeResult.conflicts; analyze-worker keeps single-file language-service fixes with the file hash; /api/diagnostics/fix takes only the diagnostic id and applies the server's own copy through EditService.applyFix (stale/invalid refused, one undo step, CRLF kept); /api/edit/outline -> templateOutline() in server/edit/outline.ts.

Shell: CanvasOverlays and InsertDrag in canvas-overlays.ts; NavHistory in page-state.ts with Back/Forward buttons; Aa text-size select; Sync selection chip; conflict callouts and 'Applying X replaces Y' (dry plan) in the Style tab; Quick fixes strip above the Problems table; TemplateOutline in Structure; palette commands for text size, back/forward and fixes.

Found by the driven check and fixed: the outline template used hover(-1) (unary minus is not allowed in templates) and read a private field before its declaration; drag-insert relied on pointer capture, which the iframes defeated, so the drag now listens on window and turns off iframe pointer events while dragging (.insert-dragging).

TODO(gable-ui): UiVirtualTable cells cannot hold buttons (fixes get their own strip); UiTree rows cannot carry chips and trailing notes (outline uses plain rows).

Validation: npx tsc -p packages/designer/tsconfig.json --noEmit OK; npm run build -w packages/designer OK; npx vitest run: 168 files / 1485 tests passed (new: polish.test.ts 9 tests, tailwind conflict tests); gable-check on the designer project reports nothing in the changed files (one pre-existing error in components/ui/toast.ts); e2e/polish-check.mjs in headless Edge, two consecutive full runs: todomvc 19/19 and ui-gallery 5/5 (server and Edge spawned by a scratch runner and killed by PID; no leftover processes).

Environment note: examples/todomvc needed todomvc-app-css and todomvc-common in its (ignored) node_modules to run in this worktree.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Canvas and panel polish for the Designer (follow-up to TASK-56.8).

What changed:
- Canvas: an amber hatch with a lock chip on elements the panels cannot edit; with Sync on, the selection is outlined in the other frames and the device bar says how many show it; an Aa text-size control (85-200%, saved per frame).
- Style tab: callouts for classes that override each other at the same variants (for example p-2 p-8), naming the winner by Tailwind's class order, with a button that removes the losing class; previewing a class says what applying it would replace.
- Page mode: Back and Forward over the router URLs, kept by the shell.
- Insert tab: drag an entry onto a frame, with an insertion line and a ghost chip. The drop is an ordinary insert edit, so it is one undo step.
- Problems: language-service quick fixes get a Fix button and a command. The server applies its own copy of the fix, refuses it when the file has changed since analysis, and the fix can be undone.
- Structure: an outline of the selected element's template (elements, bindings, {{ }} text, and @if/@for blocks shown read-only). Elements not rendered right now are dimmed, and clicking or hovering a row selects or highlights its element.

Verification: tsc, the designer build and the full vitest run (1485 tests) pass. New unit tests cover conflicts, the outline, applyFix (LF and CRLF, plus refusals), NavHistory, dropWhere and the text scale. The new e2e/polish-check.mjs passed 24/24 in headless Edge against todomvc and ui-gallery.

Risks and follow-ups:
- Two TODO(gable-ui) gaps: virtual-table cells cannot hold buttons, and tree rows cannot carry chips.
- The e2e reaches the hatch through a refused template; the Tailwind 'dynamic class list' path is covered only by the logic in CanvasOverlays.readOnly.
- In ui-gallery, after the e2e wrote a {{ }} into the h1 class attribute, the canvas kept the old template (HMR did not apply it), so the edit service refused every element of that template as stale and all of them were hatched. Not investigated.
<!-- SECTION:FINAL_SUMMARY:END -->
