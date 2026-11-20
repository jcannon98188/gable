---
kind: ticket
title: "Language service: remaining rules and quick fixes"
status: resolved
blocked_by: [25, 38]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.18 - Language-service-remaining-rules-and-quick-fixes.md
assignee:
  - '@jason'
ordinal: 39000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Each rule has a passing and a failing fixture
- [x] #2 Quick fixes produce code that type-checks

## Answer

Event/two-way/scope/Observable rules, did-you-mean, quick fixes and gable-check --fix; merged, 241 tests green.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

Event and two-way rules, Observable and Promise typing as value or undefined, scope typing for loops and lets, did-you-mean suggestions, and quick fixes that extract a computed view-model signal.
