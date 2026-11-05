---
id: TASK-2.20
title: 'tsserver plugin, grammar and VS Code extension'
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 08:05'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.17
parent_task_id: TASK-2
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The tsserver plugin offering diagnostics, completions, quick info, go-to-definition and quick fixes; the TextMate injection grammar; and the VS Code extension bundling both. Built and tested locally; not published to the marketplace.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Plugin responses are covered by tests over fixture projects
- [x] #2 The extension builds into an installable package
- [x] #3 Nothing is published
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
tsserver plugin, TextMate grammar, local vsix build; nothing published; merged, 241 tests green.
<!-- SECTION:FINAL_SUMMARY:END -->
