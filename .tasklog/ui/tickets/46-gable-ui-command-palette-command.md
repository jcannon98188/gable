---
kind: ticket
title: "gable-ui: Command palette (Command)"
status: open
tags:
  - ui
  - in-progress
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-46 - gable-ui-Command-palette-Command.md
assignee:
  - '@claude'
ordinal: 87000
---

## Question

shadcn's Command is a cmdk-style searchable command list, usually shown in a dialog. Zag has no command machine, so it needs its own filtering and keyboard navigation on top of the existing dialog primitive. Deferred from ui/28.

## Acceptance criteria

- [x] #1 Searchable command list with groups, keyboard navigation and an empty state, optionally inside a dialog
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery

## Implementation plan

1. UiCommand (data-driven items, own filtering, combobox/aria-activedescendant keyboard nav, groups, empty state) and UiCommandDialog in components/command.ts. 2. registry-meta + index. 3. jsdom tests with axe. 4. Gallery page command.html.

## Implementation notes

Gallery page examples/ui-gallery/command.html added; its test cannot run until npm run pack:local picks up the component (verified the demo against package source instead). AC3 left unchecked. jsdom: focus-trap cannot focus the search box without layout (initialFocusEl set; browser focus unverified).

Second pass: filter input (CommandFilter) on ui-command and ui-command-dialog; substringFilter stays the default, fuzzyFilter exported (subsequence, prefix/word-start/contiguity scoring, stable, every word must match). Tests added.

## Final summary

Added UiCommand and UiCommandDialog (packages/ui/src/components/command.ts): data-driven items with groups, own multi-word filtering, combobox/aria-activedescendant keyboard navigation, empty state, live result count, registry-meta entry, 14 jsdom tests incl. axe. Gallery page added; pending pack:local and browser check.
