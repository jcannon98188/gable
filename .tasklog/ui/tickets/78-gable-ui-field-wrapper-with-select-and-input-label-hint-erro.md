---
kind: ticket
title: "gable-ui: Field wrapper with Select and Input (label, hint, error)"
status: resolved
tags:
  - gable-ui
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-78 - gable-ui-Field-wrapper-with-Select-and-Input-label-hint-error.md
priority: medium
ordinal: 135000
---

## Question

The designer's edit panel, route form and device bar use native select and input because ui-field does not compose with ui-select and the input in a compact layout (edit-panel.ts:17 TODO(gable-ui)). They need a label, hint and error wrapper.

## Acceptance criteria

- [x] #1 ui-field wraps uiInput, ui-select and native controls with a label, hint and error, wiring ids, aria-describedby, aria-invalid and the error message from a [field] automatically
- [x] #2 A horizontal (label beside control) layout alongside the stacked one
- [x] #3 Works with ui-select, whose trigger is not a native control
- [x] #4 Unit tests, an axe check and a gallery demo

## Implementation plan

Extend ui-field: state optional, layout stacked|horizontal, label/id wiring for uiFieldControl on native input, ui-select (labelledBy/ids) and native controls; [field] state auto from control. Tests + gallery.

## Implementation notes

ui-field: optional state, hint alias, manual error, layout stacked|horizontal (--ui-field-label-width), density compact, slot wrapped in a grid div. ui-select inside a field is found with contentChild(UiSelect); gets fieldOwner (aria-labelledby the field label, aria-describedby, aria-invalid, label for -> trigger id); select also gained invalid input and touched output so [field] works on it. form registry now depends on input and select. Verified by field.dom.test.ts (incl. axe) and the gallery demo.

## Answer

ui-field now wraps uiInput, textarea/native select (uiFieldControl) and ui-select (auto-wired), with horizontal layout, hint/error props and compact density. Tests in field.dom.test.ts plus gallery demo; existing form tests pass. Not verified in a real browser.
