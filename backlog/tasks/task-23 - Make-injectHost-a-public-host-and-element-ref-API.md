---
id: TASK-23
title: Make injectHost a public host and element-ref API
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07 02:24'
updated_date: '2026-11-07 02:28'
labels:
  - ui
  - core
  - ready-for-agent
dependencies: []
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
injectHost() is only in @gable/core/internal. Directive-style primitives need their own host element and renderer. Expose a documented public API, with types, docs and a language-service check that it is called in a Setup context.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A public, documented host/element-ref API replaces the internal-only injectHost for library authors
- [x] #2 Docs and tests added; the internal export keeps working or is migrated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Public injectHost()/HostRef exported from @gable/core (internal re-export unchanged, same function). New language-service rule inject-host-context. Docs: docs/library-authors.md. Tests: packages/testing/src/host.test.ts, language-service file-rules.test.ts + host-pass/host-fail fixtures. vitest core+testing+language-service: 377 passed; tsc clean for core, language-service, testing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Exposed injectHost() and HostRef<N> from @gable/core, documented in docs/library-authors.md, added inject-host-context gable-check rule, and tests; verified with vitest (377 passed) and tsc.
<!-- SECTION:FINAL_SUMMARY:END -->
