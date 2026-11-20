---
kind: ticket
title: tsserver plugin, grammar and VS Code extension
status: resolved
blocked_by: [38]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.20 - tsserver-plugin-grammar-and-VS-Code-extension.md
assignee:
  - '@jason'
ordinal: 41000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Plugin responses are covered by tests over fixture projects
- [x] #2 The extension builds into an installable package
- [x] #3 Nothing is published

## Answer

tsserver plugin, TextMate grammar, local vsix build; nothing published; merged, 241 tests green.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The tsserver plugin offering diagnostics, completions, quick info, go-to-definition and quick fixes; the TextMate injection grammar; and the VS Code extension bundling both. Built and tested locally; not published to the marketplace.
