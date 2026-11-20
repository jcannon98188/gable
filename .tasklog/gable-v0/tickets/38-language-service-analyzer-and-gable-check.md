---
kind: ticket
title: Language service analyzer and gable-check
status: resolved
blocked_by: [24]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.17 - Language-service-analyzer-and-gable-check.md
assignee:
  - '@jason'
ordinal: 38000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 A bad template fails the CLI with a mapped diagnostic
- [x] #2 Severity overrides apply
- [x] #3 Fixtures cover passing and failing templates

## Answer

Analyzer and gable-check merged: type-check blocks via the real TS checker, mapped diagnostics, per-rule severity. Uses @typescript/typescript6 API (see NEEDS APPROVAL). Verified on merged integration (152 tests).

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The analyzer core (reusing the template parser, type-check blocks run by the real TypeScript checker, positions mapped back to source) and the gable-check CLI, with the value-expression and operator rules and per-rule severity from one tsconfig config. Rules default to strict.
