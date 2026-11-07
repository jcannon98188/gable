---
id: TASK-46
title: 'gable-ui: Command palette (Command)'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T03:32:00Z'
updated_date: '2026-11-07T04:36:00Z'
labels:
  - ui
dependencies: []
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
shadcn's Command is a cmdk-style searchable command list, usually shown in a dialog. Zag has no command machine, so it needs its own filtering and keyboard navigation on top of the existing dialog primitive. Deferred from TASK-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Searchable command list with groups, keyboard navigation and an empty state, optionally inside a dialog
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. UiCommand (data-driven items, own filtering, combobox/aria-activedescendant keyboard nav, groups, empty state) and UiCommandDialog in components/command.ts. 2. registry-meta + index. 3. jsdom tests with axe. 4. Gallery page command.html.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gallery page examples/ui-gallery/command.html added; its test cannot run until npm run pack:local picks up the component (verified the demo against package source instead). AC3 left unchecked. jsdom: focus-trap cannot focus the search box without layout (initialFocusEl set; browser focus unverified).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added UiCommand and UiCommandDialog (packages/ui/src/components/command.ts): data-driven items with groups, own multi-word filtering, combobox/aria-activedescendant keyboard navigation, empty state, live result count, registry-meta entry, 14 jsdom tests incl. axe. Gallery page added; pending pack:local and browser check.
<!-- SECTION:FINAL_SUMMARY:END -->
