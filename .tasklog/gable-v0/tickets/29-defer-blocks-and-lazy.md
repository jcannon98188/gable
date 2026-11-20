---
kind: ticket
title: Defer blocks and lazy()
status: resolved
blocked_by: [27]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.8 - Defer-blocks-and-lazy.md
assignee:
  - '@jason'
ordinal: 29000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 A deferred block moves through placeholder, loading and complete or error states under test
- [x] #2 lazy() outside @defer is a dev-time error
- [x] #3 Unknown triggers error naming the renderer

## Answer

@defer blocks, lazy(), fixture.defer; merged, 241 tests green.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

@defer with @placeholder, @loading and @error; triggers when, idle and timer; renderer-supplied triggers via the Renderer; lazy() entries in meta.imports usable only inside @defer; and fixture.defer to drive each block in tests.
