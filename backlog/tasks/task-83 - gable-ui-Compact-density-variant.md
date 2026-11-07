---
id: TASK-83
title: 'gable-ui: Compact density variant'
status: Done
assignee: []
created_date: '2026-11-07T06:37:00Z'
updated_date: '2026-11-07T06:49:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 140000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The design uses 26px controls, 24px rows and 10.5px uppercase section headers (inference). Needs a density/size variant rather than per-use overrides.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A compact size (or a density wrapper via a CSS variable / data attribute) for button, input, select, toggle, toggle-group, tabs and menu items
- [x] #2 A section-header utility/recipe with 10.5px uppercase tracking text
- [x] #3 Documented in the gallery and registry metadata, with tests that the compact classes apply
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Compact via size=compact (button, toggle, toggle-group) and density=compact (input, select, tabs, menus); uiSectionHeader recipe; registry meta, tests, gallery section.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Mechanism: size=compact / icon-compact on button, size=compact on toggle and toggle-group (cva variants); density=compact (shared InputDensity type from input.ts) on uiInput, ui-select, ui-tabs, ui-dropdown-menu, ui-context-menu (rows and submenus), ui-input-clear and ui-field. Compact = h-6.5 (26px), text-xs, menu rows min-h-6 (24px). uiSectionHeader directive and SECTION_HEADER constant (text-[10.5px] uppercase tracking-wider) in section-header.ts. Registry meta and index updated. Verified by density.dom.test.ts and the gallery density page.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Compact density added across button, input, select, toggle, toggle-group, tabs, menus plus the uiSectionHeader recipe; documented in registry meta/JSDoc and gallery (density.html). Tests assert compact classes apply (density.dom.test.ts). Not verified in a real browser; toggle-group registry entry is being changed by another agent.
<!-- SECTION:FINAL_SUMMARY:END -->
