---
kind: ticket
title: Make injectHost a public host and element-ref API
status: resolved
tags:
  - ui
  - core
  - ready-for-agent
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-23 - Make-injectHost-a-public-host-and-element-ref-API.md
assignee:
  - '@claude'
ordinal: 64000
---

## Question

injectHost() is only in @gablejs/core/internal. Directive-style primitives need their own host element and renderer. Expose a documented public API, with types, docs and a language-service check that it is called in a Setup context.

## Acceptance criteria

- [x] #1 A public, documented host/element-ref API replaces the internal-only injectHost for library authors
- [x] #2 Docs and tests added; the internal export keeps working or is migrated

## Implementation notes

Public injectHost()/HostRef exported from @gablejs/core (internal re-export unchanged, same function). New language-service rule inject-host-context. Docs: docs/library-authors.md. Tests: packages/testing/src/host.test.ts, language-service file-rules.test.ts + host-pass/host-fail fixtures. vitest core+testing+language-service: 377 passed; tsc clean for core, language-service, testing.

## Answer

Exposed injectHost() and HostRef<N> from @gablejs/core, documented in docs/library-authors.md, added inject-host-context gable-check rule, and tests; verified with vitest (377 passed) and tsc.
