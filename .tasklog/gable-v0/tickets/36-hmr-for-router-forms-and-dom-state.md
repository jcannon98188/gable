---
kind: ticket
title: HMR for router, forms and DOM state
status: resolved
blocked_by: [31, 32, 34, 35]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.15 - HMR-for-router-forms-and-DOM-state.md
assignee:
  - '@jason'
ordinal: 36000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Routed and form state survive an edit under test
- [x] #2 Focus and input text survive a template rebuild in the DOM renderer
- [x] #3 A config that no longer matches the URL keeps the old config and reports

## Answer

Router, form and DOM view state survive hot updates; merged.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

Router state, route injectors and form state (value, touched, baseline) survive hot updates; the DOM renderer captures and restores focus, selection, scroll and input values around a view rebuild where the structure matches.
