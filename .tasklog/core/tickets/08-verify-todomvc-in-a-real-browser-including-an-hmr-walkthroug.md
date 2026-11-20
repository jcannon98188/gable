---
kind: ticket
title: Verify TodoMVC in a real browser, including an HMR walkthrough
status: open
tags:
  - example
  - hmr
  - priority-high
created: 2026-11-06
updated: 2026-11-06
imported_from: backlog/tasks/task-8 - Verify-TodoMVC-in-a-real-browser-including-an-HMR-walkthrough.md
priority: high
ordinal: 49000
---

## Question

examples/todomvc passes tests, tsc, gable-check and vite build but has never been run in a browser. Autofocus, hash routing, edit-mode focus and, most importantly, HMR on a real app are unverified.

## Acceptance criteria

- [ ] #1 Dev server runs and every behaviour in the TodoMVC app-spec is checked manually or with a browser test
- [ ] #2 Editing a component, template, style and the store hot-updates with todos, filter and an in-progress edit preserved
- [ ] #3 Any bugs found are filed or fixed

## Implementation notes

User confirmed HMR works in a real browser (2026-11-05). Remaining: check each app-spec behaviour in a browser.
