---
kind: ticket
title: Error handling and logging story
status: resolved
tags:
  - core
  - docs
  - ready-for-agent
  - priority-low
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-42 - Error-handling-and-logging-story.md
assignee:
  - '@claude'
priority: low
ordinal: 83000
---

## Question

ErrorHandler exists, but there is no documented pattern for reporting errors to a service, user-facing error boundaries (a component or route level fallback) or dev-time error overlay behaviour. Document the current behaviour, add an error-boundary mechanism if one is missing (a component that renders fallback content when its subtree fails in setup or effects), and add a reporting example.

## Acceptance criteria

- [x] #1 Current error flow documented end to end with a reporting example
- [x] #2 Error boundary mechanism exists or the decision not to add one is recorded, with tests

## Implementation plan

1. Scope-chain boundary hook + ErrorBoundary component. 2. docs/errors.md linked from getting-started. 3. Tests.

## Implementation notes

Design: ErrorBoundary (core/src/error-boundary.ts) registers scope.owner.boundary; reportError notifies handler first, then walks scope parents to the nearest boundary that accepts the source. Defers the state write via queueMicrotask because a failure can occur mid-build inside the @if effect that reads failed(). Default catch: setup, effect, binding, subscription; events/router/lazy report only. reset() and resetKey input. Failure inside fallback bubbles to the outer boundary. Docs: docs/errors.md (flow, Sentry example, dev vs prod; there is no built-in overlay). Tests: packages/testing/src/error-boundary.test.ts (setup, effect, event, reset, nesting). vitest core+testing 352 pass; tsc core and testing build configs clean.

## Answer

Added ErrorBoundary and docs/errors.md (end-to-end flow, Sentry-style handler, dev/prod, boundaries), linked from getting-started. Tests cover setup, effect, event, reset and nesting. Risk: boundary state write is microtask-deferred; events do not trip by default.
