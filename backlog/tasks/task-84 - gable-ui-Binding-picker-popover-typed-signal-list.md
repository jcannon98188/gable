---
id: TASK-84
title: 'gable-ui: Binding picker popover (typed signal list)'
status: Done
assignee: []
created_date: '2026-11-07T06:37:00Z'
updated_date: '2026-11-07T06:50:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The design has a popover binding picker: a Command-style list of typed signals with a type tag (inference).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A recipe or component combining popover and command with items showing a label and a type tag (CommandItem gains an optional badge/tag)
- [x] #2 Selecting an item closes the popover, returns focus to the trigger and emits the value
- [x] #3 Tests, an axe check and a gallery demo
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
CommandItem.badge + UiBindingPicker (popover + command)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CommandItem gained badge (rendered and searchable). binding-picker.ts + dom tests (open, search by tag, choose closes/focuses trigger/emits, Escape, axe). Gallery overlays.html.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added UiBindingPicker and CommandItem.badge; choosing closes the popover, restores focus to the trigger (explicitly, since programmatic close does not always restore) and emits picked/value.
<!-- SECTION:FINAL_SUMMARY:END -->
