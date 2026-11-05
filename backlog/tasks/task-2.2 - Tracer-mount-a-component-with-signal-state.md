---
id: TASK-2.2
title: 'Tracer: mount a component with signal state'
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:07'
updated_date: '2026-11-05 07:16'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.1
parent_task_id: TASK-2
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The thinnest end-to-end path: a plain-class component with static meta and a signal, an html template with text and property bindings, the single microtask flush scheduler, the Renderer contract, the in-memory Test renderer, and mount with flush, query and html(). Signals wrap a pinned polyfill that never appears in public types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test mounts a component, changes a signal, flushes, and observes the updated node tree
- [x] #2 Signal writes in one tick coalesce into one flush, parents before children
- [x] #3 Plain-field mutation does not update the view
- [x] #4 Public types do not expose the polyfill
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Tracer merged on integration/gable-v0: wrapped signal-polyfill signals, effect, coalesced scheduler, scopes, html parser (text and [prop] bindings), Renderer contract, test renderer, mount/Fixture. Verified: build clean, 8 tests pass. Tests were written after code, not red-first.
<!-- SECTION:FINAL_SUMMARY:END -->
