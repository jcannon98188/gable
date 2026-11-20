---
kind: ticket
title: "Root npm run build: @gable/ui fails on command.ts regex"
status: resolved
tags:
  - ui
  - priority-high
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-68 - Root-npm-run-build-gable-ui-fails-on-command.ts-regex.md
priority: high
ordinal: 116000
---

## Question

command.ts(47,40) TS1517 Range out of order in character class breaks npm run build (and create-gable scaffold.test, which runs the root build). Owner: gable-ui components work.

## Answer

Resolved: the command.ts error seen mid-session no longer reproduces; npm run build exits 0 on the final tree (commit 1ce7908).
