---
id: TASK-8
title: 'Verify TodoMVC in a real browser, including an HMR walkthrough'
status: To Do
assignee: []
created_date: '2026-11-06 03:23'
updated_date: '2026-11-06 03:30'
labels:
  - example
  - hmr
dependencies: []
priority: high
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
examples/todomvc passes tests, tsc, gable-check and vite build but has never been run in a browser. Autofocus, hash routing, edit-mode focus and, most importantly, HMR on a real app are unverified.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dev server runs and every behaviour in the TodoMVC app-spec is checked manually or with a browser test
- [ ] #2 Editing a component, template, style and the store hot-updates with todos, filter and an in-progress edit preserved
- [ ] #3 Any bugs found are filed or fixed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User confirmed HMR works in a real browser (2026-11-05). Remaining: check each app-spec behaviour in a browser.
<!-- SECTION:NOTES:END -->
