---
kind: ticket
title: Error handling
status: resolved
blocked_by: [27]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.7 - Error-handling.md
assignee:
  - '@jason'
ordinal: 28000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Each failure source is reported with correct attribution and the app keeps running as specified
- [x] #2 A failed Setup disposes its scope and renders an empty host while siblings continue
- [x] #3 A throwing handler falls back to the console without recursion
- [x] #4 Unexpected errors fail tests unless claimed

## Answer

ErrorHandler token, error contexts, fail-soft rules, claimErrors on the Fixture; merged, 241 tests green.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The root ErrorHandler Token with error context (source, component, injector, detail), default log-and-swallow, and the fail-soft rules for setup, effects, events, bindings and subscriptions. The test harness collects reports and rethrows from flush and settle.
