---
id: TASK-75.3
title: 'Editor: core formatting, toolbar and schema'
status: Done
assignee: []
created_date: '2026-11-07T06:33:00Z'
updated_date: '2026-11-07T06:44:00Z'
labels:
  - editor
dependencies:
  - TASK-75.1
parent_task_id: TASK-75
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The baseline CKEditor-style experience: what users expect from any rich text editor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Bold, italic, underline, strike, code, link, headings, lists (bullet, ordered, task), blockquote, code block, horizontal rule
- [x] #2 Undo/redo, markdown-style input rules and keyboard shortcuts
- [x] #3 Fixed and floating (bubble) toolbar built from gable-ui primitives, driven by plugin-contributed items
- [x] #4 Gable component wrapper with signal-based value/readonly/disabled inputs
- [x] #5 Accessible: keyboard operable toolbar, ARIA roles, axe checks pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Formatting plugins wrapping TipTap extensions: inline marks (bold/italic/underline/strike/code/link), blocks (heading, blockquote, codeBlock, hr, hardBreak), lists (bullet/ordered/task), each with toolbar items; undoRedo plugin (non-collab) using TipTap undo-redo.
2. Toolbar model: a pure-state view-model (items + active/enabled state, subscribes to editor transactions) usable by any UI.
3. Gable pieces: look at gable-ui conventions; build <gable-editor> component and toolbar from gable-ui primitives (fixed + bubble), signal inputs value/readonly/disabled.
4. Tests + axe check; docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plugins in src/plugins/formatting.ts; toolbar view-model src/toolbar-model.ts; <gable-editor> in src/component/editor-element.ts. 54 tests incl. jsdom component tests (axe clean, keyboard nav, readonly, bubble toolbar, value sync). Notes: template language has no ?: so view-model rows are computed; @gable/ui is a private/copied pack so the editor depends on it for UiToggle; toolbar uses text glyphs because gable-ui has only 18 icons (icon set follow-up); the link item uses window.prompt for the URL until a popover UI exists; bubble position is basic (no collision handling).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Formatting plugin set, UI-agnostic toolbar model and the Gable <gable-editor> component with fixed and bubble toolbars. Verified by 54 passing vitest tests (jsdom, axe) and clean tsc.
<!-- SECTION:FINAL_SUMMARY:END -->
