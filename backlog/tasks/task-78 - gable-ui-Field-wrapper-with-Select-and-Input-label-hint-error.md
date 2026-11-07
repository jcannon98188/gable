---
id: TASK-78
title: 'gable-ui: Field wrapper with Select and Input (label, hint, error)'
status: Done
assignee: []
created_date: '2026-11-07T06:37:00Z'
updated_date: '2026-11-07T06:49:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The designer's edit panel, route form and device bar use native select and input because ui-field does not compose with ui-select and the input in a compact layout (edit-panel.ts:17 TODO(gable-ui)). They need a label, hint and error wrapper.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ui-field wraps uiInput, ui-select and native controls with a label, hint and error, wiring ids, aria-describedby, aria-invalid and the error message from a [field] automatically
- [x] #2 A horizontal (label beside control) layout alongside the stacked one
- [x] #3 Works with ui-select, whose trigger is not a native control
- [x] #4 Unit tests, an axe check and a gallery demo
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Extend ui-field: state optional, layout stacked|horizontal, label/id wiring for uiFieldControl on native input, ui-select (labelledBy/ids) and native controls; [field] state auto from control. Tests + gallery.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ui-field: optional state, hint alias, manual error, layout stacked|horizontal (--ui-field-label-width), density compact, slot wrapped in a grid div. ui-select inside a field is found with contentChild(UiSelect); gets fieldOwner (aria-labelledby the field label, aria-describedby, aria-invalid, label for -> trigger id); select also gained invalid input and touched output so [field] works on it. form registry now depends on input and select. Verified by field.dom.test.ts (incl. axe) and the gallery demo.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ui-field now wraps uiInput, textarea/native select (uiFieldControl) and ui-select (auto-wired), with horizontal layout, hint/error props and compact density. Tests in field.dom.test.ts plus gallery demo; existing form tests pass. Not verified in a real browser.
<!-- SECTION:FINAL_SUMMARY:END -->
