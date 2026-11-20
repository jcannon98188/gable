---
kind: ticket
title: "Template language: bindings and control flow"
status: resolved
blocked_by: [23]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.3 - Template-language-bindings-and-control-flow.md
assignee:
  - '@jason'
ordinal: 24000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Each construct renders and updates correctly through the Fixture
- [x] #2 Disallowed expressions give a clear dev-time error
- [x] #3 Handlers may call functions with references, literals or the event
- [x] #4 @for without track is rejected

## Answer

Template bindings and control flow merged on integration/gable-v0 (41 tests at branch, 61 after merge with DI). Verified by build and test run on the merged branch.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The full template syntax: attribute, class, style and event bindings, two-way model binding, template refs, @if/@else, @for with required track and @empty, @switch, @let, and the restricted expression language (property reads, zero-argument signal reads, literals, !, ??). No eval; templates parse once per call site.
