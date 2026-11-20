---
kind: ticket
title: "Meta and SEO service: Meta, canonical link and per-route metadata"
status: resolved
tags:
  - platform
  - router
  - ready-for-agent
  - priority-low
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-40 - Meta-and-SEO-service-Meta-canonical-link-and-per-route-metadata.md
assignee:
  - '@claude'
priority: low
ordinal: 81000
---

## Question

There is a Title service in the platform layer but no equivalent for meta tags. Add a Meta service (description, og:*, twitter:*, robots, canonical link, theme-color) beside Title in the renderer platform layer, with a route data hook so routes can declare title and meta, plus a DOM implementation and an in-memory one for tests.

## Acceptance criteria

- [x] #1 Meta service with DOM and test implementations, set and updated declaratively from route data
- [x] #2 Documented, with tests

## Implementation plan

1. Meta/MetaTags/metaEntries/mergeMeta in core platform.ts. 2. DOM Meta in renderer-dom (adopt/restore existing tags). 3. In-memory Meta in testing platform. 4. Route.meta merged root-down, applied by router on each navigation. 5. Tests and docs/router.md.

## Implementation notes

Router: only added Route.meta field and one mergeMeta/set line after Title in router-state.ts (additive). Title behaviour unchanged. Tests: packages/testing/src/meta.test.ts, Meta block in renderer-dom platform.test.ts. vitest core/renderer-dom/testing 375 pass; tsc (build configs) clean.

## Answer

Added Meta service (description, robots, theme-color, canonical link, og:*, twitter:*) beside Title with DOM (head tags, adopts and restores page-authored tags) and in-memory implementations; routes declare it via Route.meta, merged root-down and replaced on every navigation. Documented in docs/router.md (Meta and SEO). Tests pass.
