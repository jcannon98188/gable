---
kind: ticket
title: "gable-ui: Tabs with badges"
status: resolved
tags:
  - gable-ui
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-90 - gable-ui-Tabs-with-badges.md
priority: medium
ordinal: 151000
---

## Question

Reported while building the designer shell: ui-tab has only a text label, so a count or status badge beside a tab label needs a custom trigger.

## Acceptance criteria

- [x] #1 ui-tab accepts a badge (text or number) shown after the label, styled for selected and compact density, and included in the trigger's accessible name
- [x] #2 Unit tests, an axe check and a gallery demo

## Implementation plan

Add badge input to ui-tab, render span inside trigger; tests + gallery demo

## Implementation notes

Tests in packages/ui/src/components/tabs.test.ts; gallery 'Tabs with badges' demo; gallery a11y axe test covers it. Not browser-verified.

## Answer

ui-tab gains badge input (string|number) rendered after the label inside the trigger (selected + compact styling). Unit tests, gallery demo (covered by existing gallery axe test) pass.
