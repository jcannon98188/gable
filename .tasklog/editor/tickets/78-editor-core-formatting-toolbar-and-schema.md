---
kind: ticket
title: "Editor: core formatting, toolbar and schema"
status: resolved
blocked_by: [76]
tags:
  - editor
  - parent-75
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75.3 - Editor-core-formatting-toolbar-and-schema.md
ordinal: 127000
---

## Question

The baseline CKEditor-style experience: what users expect from any rich text editor.

## Acceptance criteria

- [x] #1 Bold, italic, underline, strike, code, link, headings, lists (bullet, ordered, task), blockquote, code block, horizontal rule
- [x] #2 Undo/redo, markdown-style input rules and keyboard shortcuts
- [x] #3 Fixed and floating (bubble) toolbar built from gable-ui primitives, driven by plugin-contributed items
- [x] #4 Gable component wrapper with signal-based value/readonly/disabled inputs
- [x] #5 Accessible: keyboard operable toolbar, ARIA roles, axe checks pass

## Implementation plan

1. Formatting plugins wrapping TipTap extensions: inline marks (bold/italic/underline/strike/code/link), blocks (heading, blockquote, codeBlock, hr, hardBreak), lists (bullet/ordered/task), each with toolbar items; undoRedo plugin (non-collab) using TipTap undo-redo.
2. Toolbar model: a pure-state view-model (items + active/enabled state, subscribes to editor transactions) usable by any UI.
3. Gable pieces: look at gable-ui conventions; build <gable-editor> component and toolbar from gable-ui primitives (fixed + bubble), signal inputs value/readonly/disabled.
4. Tests + axe check; docs.

## Implementation notes

Plugins in src/plugins/formatting.ts; toolbar view-model src/toolbar-model.ts; <gable-editor> in src/component/editor-element.ts. 54 tests incl. jsdom component tests (axe clean, keyboard nav, readonly, bubble toolbar, value sync). Notes: template language has no ?: so view-model rows are computed; @gablejs/ui is a private/copied pack so the editor depends on it for UiToggle; toolbar uses text glyphs because gable-ui has only 18 icons (icon set follow-up); the link item uses window.prompt for the URL until a popover UI exists; bubble position is basic (no collision handling).

## Answer

Formatting plugin set, UI-agnostic toolbar model and the Gable <gable-editor> component with fixed and bubble toolbars. Verified by 54 passing vitest tests (jsdom, axe) and clean tsc.
