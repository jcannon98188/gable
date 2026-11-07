---
id: TASK-75.1
title: 'Editor: package scaffold and plugin API'
status: Done
assignee: []
created_date: '2026-11-07T06:33:00Z'
updated_date: '2026-11-07T06:35:00Z'
labels:
  - editor
dependencies: []
parent_task_id: TASK-75
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Everything else (formatting, tables, collab, comments) must ship as plugins, so the plugin contract has to exist before any feature is written. Decides how a plugin contributes schema nodes/marks, commands, keymaps, toolbar items, ProseMirror plugins and Yjs-aware state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/editor builds and is wired into the workspace build and vitest config
- [x] #2 A plugin can contribute nodes, marks, commands, keybindings, toolbar items and ProseMirror plugins, with declared dependencies and ordering
- [x] #3 Editor core is framework-agnostic; a headless instance runs in tests without a DOM framework
- [x] #4 Plugin API documented, with a sample plugin and tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create packages/editor (package.json, tsconfig, build config), add to root build + vitest alias.
2. Define EditorPlugin contract (name, requires, priority, nodes/marks/commands/keymap/toolbar/pmPlugins/yjs hooks); resolver that topo-sorts and validates, compiling into TipTap extensions.
3. Headless createEditorCore (schema via TipTap getSchema, state without DOM) for tests.
4. Sample plugin + vitest tests; short docs in packages/editor/README.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plugin contract in packages/editor/src/plugin.ts; GableEditor wraps TipTap Editor (headless without element). 6 vitest tests pass (jsdom); tsc build clean. Note: y-prosemirror is MIT-licensed; we proceed with own binding per user decision.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scaffolded @gable/editor with EditorPlugin API (extensions, toolbar, yjs hook, requires/priority resolution, error cases), GableEditor, corePlugin, README, workspace build + vitest alias. Verified by 6 passing tests and a clean tsc build.
<!-- SECTION:FINAL_SUMMARY:END -->
