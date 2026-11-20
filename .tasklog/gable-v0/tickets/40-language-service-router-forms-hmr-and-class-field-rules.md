---
kind: ticket
title: "Language service: router, forms, HMR and class-field rules"
status: resolved
blocked_by: [32, 34, 35, 38]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.19 - Language-service-router-forms-HMR-and-class-field-rules.md
assignee:
  - '@jason'
ordinal: 40000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Each rule has a passing and a failing fixture through gable-check
- [x] #2 hotState suppresses the top-level warning

## Answer

15 new rules (router, forms, file, class-field), @defer support in analyzer, hotState suppression; merged.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

File rules (constructors, module-level signals and subjects, lazy outside defer, non-literal Tailwind class fragments, tsconfig settings that break class fields) and the router and forms rules, with hotState suppressing the module-level warning.
