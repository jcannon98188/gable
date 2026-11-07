---
id: TASK-28
title: 'Port remaining gable-ui components, including Form and Field'
status: To Do
assignee: []
created_date: '2026-11-07 02:24'
labels:
  - ui
  - ready-for-agent
dependencies:
  - TASK-26
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the rest of the shadcn set over the primitives, in batches. Form and Field are built on the existing signal-based forms layer in core (forms.ts) with validation and error display. Add-ons without a Gable equivalent (command palette, toasts, drawer, carousel, date picker, charts, OTP input, resizable panels) are listed here and split into their own tasks as they are reached.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Remaining core shadcn components are ported with tests
- [ ] #2 Form and Field work with Form<T> and the schema validators
- [ ] #3 Add-on components are each filed as separate tasks
<!-- AC:END -->
