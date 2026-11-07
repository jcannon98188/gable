---
id: TASK-42
title: Error handling and logging story
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:30:00Z'
updated_date: '2026-11-07T03:45:00Z'
labels:
  - core
  - docs
  - ready-for-agent
dependencies: []
priority: low
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ErrorHandler exists, but there is no documented pattern for reporting errors to a service, user-facing error boundaries (a component or route level fallback) or dev-time error overlay behaviour. Document the current behaviour, add an error-boundary mechanism if one is missing (a component that renders fallback content when its subtree fails in setup or effects), and add a reporting example.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Current error flow documented end to end with a reporting example
- [x] #2 Error boundary mechanism exists or the decision not to add one is recorded, with tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scope-chain boundary hook + ErrorBoundary component. 2. docs/errors.md linked from getting-started. 3. Tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design: ErrorBoundary (core/src/error-boundary.ts) registers scope.owner.boundary; reportError notifies handler first, then walks scope parents to the nearest boundary that accepts the source. Defers the state write via queueMicrotask because a failure can occur mid-build inside the @if effect that reads failed(). Default catch: setup, effect, binding, subscription; events/router/lazy report only. reset() and resetKey input. Failure inside fallback bubbles to the outer boundary. Docs: docs/errors.md (flow, Sentry example, dev vs prod; there is no built-in overlay). Tests: packages/testing/src/error-boundary.test.ts (setup, effect, event, reset, nesting). vitest core+testing 352 pass; tsc core and testing build configs clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ErrorBoundary and docs/errors.md (end-to-end flow, Sentry-style handler, dev/prod, boundaries), linked from getting-started. Tests cover setup, effect, event, reset and nesting. Risk: boundary state write is microtask-deferred; events do not trip by default.
<!-- SECTION:FINAL_SUMMARY:END -->
