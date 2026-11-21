---
kind: ticket
title: Gable Vite plugin
status: resolved
blocked_by: [31, 35]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.16 - Gable-Vite-plugin.md
assignee:
  - '@jason'
ordinal: 37000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 A dev server hot-updates a sample app with state preserved
- [x] #2 The production bundle contains no HMR code
- [x] #3 A conflicting tsconfig gives a clear fail-fast message

## Answer

@gablejs/vite plugin, dev hot update, no HMR in prod bundle, tsconfig fail-fast; merged.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The thin Vite plugin: a dev-only accept line appended to modules importing Gable, no template parsing, no production transforms, forced native class fields with fail-fast tsconfig checks, and composition beside the Tailwind v4 plugin. A production-bundle test asserts no HMR code.
