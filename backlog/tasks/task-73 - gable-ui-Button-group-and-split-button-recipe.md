---
id: TASK-73
title: 'gable-ui: Button group and split-button recipe'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T05:05:00Z'
updated_date: '2026-11-07T05:08:00Z'
labels:
  - ui
  - gable-ui
dependencies: []
priority: medium
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported missing while dogfooding: split button. shadcn has no split button; it is a Button joined to a Dropdown Menu trigger inside a button group. Add ui-button-group (joined borders/radius, orientation, role=group with label) and a documented split-button recipe using Button + DropdownMenu, with one accessible name for the pair and correct menu button semantics (aria-haspopup, aria-expanded on the chevron trigger).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ui-button-group component with horizontal and vertical orientation
- [ ] #2 Split-button recipe in docs and gallery using Button + DropdownMenu, axe clean
- [x] #3 registry-meta entry and tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ui-button-group + text addon. 2. Split-button recipe as tested Button + DropdownMenu in group. 3. registry-meta, docs, gallery page. 4. Tests (memory, jsdom, axe).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented component, tests, docs/ui-primitives.md section, gallery page examples/ui-gallery/button-group.html. Gallery page test needs npm run pack:local (not run).

AC2 left unchecked: recipe is axe-clean in packages/ui jsdom test and documented, but the gallery page test/browser run needs pack:local, not run.
<!-- SECTION:NOTES:END -->
