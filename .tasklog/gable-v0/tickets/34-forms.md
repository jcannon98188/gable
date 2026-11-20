---
kind: ticket
title: Forms
status: resolved
blocked_by: [25, 31]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.13 - Forms.md
assignee:
  - '@jason'
ordinal: 34000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 A form with sync and async validation, submit and server errors works through the Fixture
- [x] #2 Array rows keep state by key
- [x] #3 A model key named state is rejected

## Answer

Forms with sync/async validation, submit, array rows, field directive on both renderers; merged.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

form(model, schema) with fine-grained writable signal nodes, the reserved state namespace, sync rules, composition, conditional state, RxJS async validation, submit, array rows with stable keys, and the field directive in both renderers with the custom-control convention.
