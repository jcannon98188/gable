---
id: TASK-54
title: 'gable-ui: Menu submenus, radio items and range slider follow-ups'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T03:32:00Z'
updated_date: '2026-11-07T04:44:00Z'
labels:
  - ui
dependencies: []
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-28 shipped Dropdown Menu and Context Menu with items, checkbox items, labels and separators, a single-thumb Slider and a single-select Combobox. These variations were left out: submenus and radio-group items in menus, a multi-thumb range slider, and a multi-select combobox.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Menus support submenus and radio-group items
- [x] #2 Slider supports two or more thumbs
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Menus: add radio-group and submenu entries to MenuEntry; submenus are a recursive ui-menu-sub component with its own Zag menu machine linked via setChild/setParent. 2. Slider: new ui-range-slider with a number[] model. 3. Tests (jsdom, axe) for both; registry-meta exports. 4. Gallery: separate menus.html demo page.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in packages/ui (dropdown-menu.ts: UiMenuSub, radio-group/submenu entries, radioChange output; context-menu.ts same; slider.ts: UiRangeSlider). Tests: menu-submenu.dom.test.ts (11, incl. axe with submenu open), range-slider.dom.test.ts (5, incl. axe); npx vitest run packages/ui packages/ui-primitives: 341 passed. Gallery page examples/ui-gallery/menus.html + src/menus-demo.ts; its jsdom test passes only when run against package sources (the gallery resolves vendored tarballs of @gable/ui that predate these exports, so it needs a rebuild/repack to run in the gallery). AC3 left unchecked: not run in a real browser or via the gallery's own build. Not done: multi-select combobox (in the description, not in the ACs); disabled submenu triggers.
<!-- SECTION:NOTES:END -->
