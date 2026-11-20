---
kind: ticket
title: create-gable starter and docs
status: resolved
blocked_by: [37, 41, 42]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.22 - create-gable-starter-and-docs.md
assignee:
  - '@jason'
ordinal: 43000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 CI scaffolds the starter into a temp directory and runs install, check, test and build
- [x] #2 The CI test asserts no HMR code in the production bundle
- [x] #3 The docs pages exist and mirror the template

## Answer

create-gable starter, scaffold CI test, docs; merged. Nothing published.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

create-gable copies the single starter template (Vite, TypeScript, Tailwind v4, Vitest, Prettier, sample Counter app with service and test, language-service wiring, check script, editor settings), pins versions to its own release, and detects the invoking package manager. Includes the Getting started page and the manual-setup page. Not published.
