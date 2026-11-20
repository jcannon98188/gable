---
kind: ticket
title: "gable-ui: Binding picker popover (typed signal list)"
status: resolved
tags:
  - gable-ui
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-84 - gable-ui-Binding-picker-popover-typed-signal-list.md
priority: medium
ordinal: 141000
---

## Question

The design has a popover binding picker: a Command-style list of typed signals with a type tag (inference).

## Acceptance criteria

- [x] #1 A recipe or component combining popover and command with items showing a label and a type tag (CommandItem gains an optional badge/tag)
- [x] #2 Selecting an item closes the popover, returns focus to the trigger and emits the value
- [x] #3 Tests, an axe check and a gallery demo

## Implementation plan

CommandItem.badge + UiBindingPicker (popover + command)

## Implementation notes

CommandItem gained badge (rendered and searchable). binding-picker.ts + dom tests (open, search by tag, choose closes/focuses trigger/emits, Escape, axe). Gallery overlays.html.

## Answer

Added UiBindingPicker and CommandItem.badge; choosing closes the popover, restores focus to the trigger (explicitly, since programmatic close does not always restore) and emits picked/value.
