---
kind: ticket
title: "gable-ui: Button group and split-button recipe"
status: claimed
claimed_by: "@claude"
tags:
  - ui
  - gable-ui
  - in-progress
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-73 - gable-ui-Button-group-and-split-button-recipe.md
assignee:
  - '@claude'
priority: medium
ordinal: 121000
---

## Question

Reported missing while dogfooding: split button. shadcn has no split button; it is a Button joined to a Dropdown Menu trigger inside a button group. Add ui-button-group (joined borders/radius, orientation, role=group with label) and a documented split-button recipe using Button + DropdownMenu, with one accessible name for the pair and correct menu button semantics (aria-haspopup, aria-expanded on the chevron trigger).

## Acceptance criteria

- [x] #1 ui-button-group component with horizontal and vertical orientation
- [ ] #2 Split-button recipe in docs and gallery using Button + DropdownMenu, axe clean
- [x] #3 registry-meta entry and tests

## Implementation plan

1. ui-button-group + text addon. 2. Split-button recipe as tested Button + DropdownMenu in group. 3. registry-meta, docs, gallery page. 4. Tests (memory, jsdom, axe).

## Implementation notes

Implemented component, tests, docs/ui-primitives.md section, gallery page examples/ui-gallery/button-group.html. Gallery page test needs npm run pack:local (not run).

AC2 left unchecked: recipe is axe-clean in packages/ui jsdom test and documented, but the gallery page test/browser run needs pack:local, not run.
