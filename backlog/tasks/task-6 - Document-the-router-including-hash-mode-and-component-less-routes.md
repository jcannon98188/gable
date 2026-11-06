---
id: TASK-6
title: 'Document the router, including hash mode and component-less routes'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:23'
updated_date: '2026-11-06 03:32'
labels:
  - docs
dependencies: []
priority: medium
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
There is no router documentation. Building TodoMVC required reading source to learn that dom({ mode: 'hash' }) exists, that route data is exposed as Router.data(), and that routes without a component are accepted. Users need a guide covering this.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A docs page covers provideRouter, Route fields, params, data, guards and RouterOutlet/RouterLink
- [x] #2 It documents dom({ mode: 'hash' }) and the filter-from-route-data pattern
- [x] #3 It states whether component-less routes are supported, and tests cover that decision
- [x] #4 Linked from README and getting-started
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read router source/tests/todomvc
2. Add component-less route test if missing
3. Write docs/router.md
4. Link from README and getting-started
5. Run router tests
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added test for data-only leaf routes (no component/children); router.test.ts 31/31 pass. Decision: component-less routes are supported (grouping, redirectTo, data-only leaf). Docs: docs/router.md, linked from README and getting-started.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wrote docs/router.md (provideRouter, Route fields, params, data, guards, lazy, links, hash mode, filter-from-route-data, testing), linked from README and getting-started. Component-less routes documented as supported; new test covers data-only leaf routes. Verified: npx vitest run packages/testing/src/router.test.ts passes (31 tests).
<!-- SECTION:FINAL_SUMMARY:END -->
