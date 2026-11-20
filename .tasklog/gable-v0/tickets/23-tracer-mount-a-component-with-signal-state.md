---
kind: ticket
title: "Tracer: mount a component with signal state"
status: resolved
blocked_by: [22]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.2 - Tracer-mount-a-component-with-signal-state.md
assignee:
  - '@jason'
ordinal: 23000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 A test mounts a component, changes a signal, flushes, and observes the updated node tree
- [x] #2 Signal writes in one tick coalesce into one flush, parents before children
- [x] #3 Plain-field mutation does not update the view
- [x] #4 Public types do not expose the polyfill

## Answer

Tracer merged on integration/gable-v0: wrapped signal-polyfill signals, effect, coalesced scheduler, scopes, html parser (text and [prop] bindings), Renderer contract, test renderer, mount/Fixture. Verified: build clean, 8 tests pass. Tests were written after code, not red-first.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The thinnest end-to-end path: a plain-class component with static meta and a signal, an html template with text and property bindings, the single microtask flush scheduler, the Renderer contract, the in-memory Test renderer, and mount with flush, query and html(). Signals wrap a pinned polyfill that never appears in public types.
