---
kind: ticket
title: Template formatter and Prettier plugin
status: resolved
blocked_by: [24]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.21 - Template-formatter-and-Prettier-plugin.md
assignee:
  - '@jason'
ordinal: 42000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Formatting is deterministic and idempotent
- [x] #2 Only html template literals are edited
- [x] #3 The Prettier plugin formats a sample project

## Answer

Formatter and Prettier plugin merged as @gable/template-format and @gable/prettier-plugin. Verified on merged integration (152 tests).

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The pure formatTemplate, a template-only CLI that rewrites only html template literals, and the Prettier plugin wrapping it.
