---
kind: ticket
title: Testing harness completion
status: resolved
blocked_by: [28, 29]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.9 - Testing-harness-completion.md
assignee:
  - '@jason'
ordinal: 30000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Debounce and timer behaviour is testable deterministically
- [x] #2 Leftover error reports fail a test at teardown
- [x] #3 overrides replace a child or lazy entry for one test

## Answer

settle, flushSync, advance, errors.expect, overrides, auto-cleanup; merged.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

settle, flushSync, advance(ms) on the runner fake timers, component overrides, errors.expect, and stable pretty-printed html() snapshots, with auto-cleanup. Runner-agnostic with no globals and no jsdom.
