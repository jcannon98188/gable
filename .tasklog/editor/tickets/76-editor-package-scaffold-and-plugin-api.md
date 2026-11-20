---
kind: ticket
title: "Editor: package scaffold and plugin API"
status: resolved
tags:
  - editor
  - parent-75
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75.1 - Editor-package-scaffold-and-plugin-API.md
ordinal: 125000
---

## Question

Everything else (formatting, tables, collab, comments) must ship as plugins, so the plugin contract has to exist before any feature is written. Decides how a plugin contributes schema nodes/marks, commands, keymaps, toolbar items, ProseMirror plugins and Yjs-aware state.

## Acceptance criteria

- [x] #1 packages/editor builds and is wired into the workspace build and vitest config
- [x] #2 A plugin can contribute nodes, marks, commands, keybindings, toolbar items and ProseMirror plugins, with declared dependencies and ordering
- [x] #3 Editor core is framework-agnostic; a headless instance runs in tests without a DOM framework
- [x] #4 Plugin API documented, with a sample plugin and tests

## Implementation plan

1. Create packages/editor (package.json, tsconfig, build config), add to root build + vitest alias.
2. Define EditorPlugin contract (name, requires, priority, nodes/marks/commands/keymap/toolbar/pmPlugins/yjs hooks); resolver that topo-sorts and validates, compiling into TipTap extensions.
3. Headless createEditorCore (schema via TipTap getSchema, state without DOM) for tests.
4. Sample plugin + vitest tests; short docs in packages/editor/README.md.

## Implementation notes

Plugin contract in packages/editor/src/plugin.ts; GableEditor wraps TipTap Editor (headless without element). 6 vitest tests pass (jsdom); tsc build clean. Note: y-prosemirror is MIT-licensed; we proceed with own binding per user decision.

## Answer

Scaffolded @gable/editor with EditorPlugin API (extensions, toolbar, yjs hook, requires/priority resolution, error cases), GableEditor, corePlugin, README, workspace build + vitest alias. Verified by 6 passing tests and a clean tsc build.
