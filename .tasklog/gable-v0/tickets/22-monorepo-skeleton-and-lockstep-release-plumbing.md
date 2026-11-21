---
kind: ticket
title: Monorepo skeleton and lockstep release plumbing
status: resolved
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.1 - Monorepo-skeleton-and-lockstep-release-plumbing.md
assignee:
  - '@jason'
ordinal: 22000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 A CI run builds and tests the empty packages
- [x] #2 All packages share one version via Changesets
- [x] #3 Packages are ESM-only with exports maps and type declarations

## Answer

Monorepo skeleton merged on integration/gable-v0: npm workspaces, empty @gablejs/core and @gablejs/testing, Vitest, tsc builds, Changesets fixed lockstep, CI workflow. Verified: install, build and 2 smoke tests pass; lockstep bump checked. CI workflow itself not run (local).

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

A workspace holding the Gable package family with shared TypeScript settings (ES2022, native class fields), a test runner, and Changesets configured for lockstep versioning on 0.x. Only empty core and testing packages exist. Nothing is published.
