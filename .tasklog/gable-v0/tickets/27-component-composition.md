---
kind: ticket
title: Component composition
status: resolved
blocked_by: [24, 26]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.6 - Component-composition.md
assignee:
  - '@jason'
ordinal: 27000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 A parent composes children with inputs, outputs and slots in the Fixture
- [x] #2 Queries update reactively
- [x] #3 Scoped styles are applied and replaceable in place by id
- [x] #4 bootstrap mounts a root with providers and a target

## Answer

Composition merged: imports, input/output/model, slots, queries, meta.host, scoped styles via registerStyles, createComponent, bootstrap. Verified on merged integration (152 tests).

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

meta.imports (components and attribute directives), input, output and model fields, default and named slots, signal-returning view and content queries, meta.host, scoped styles via registerStyles, createComponent and bootstrap taking the Renderer as an argument. An unknown element is a clear dev-time error.
