---
id: TASK-6
title: 'Document the router, including hash mode and component-less routes'
status: To Do
assignee: []
created_date: '2026-11-06 03:23'
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
- [ ] #1 A docs page covers provideRouter, Route fields, params, data, guards and RouterOutlet/RouterLink
- [ ] #2 It documents dom({ mode: 'hash' }) and the filter-from-route-data pattern
- [ ] #3 It states whether component-less routes are supported, and tests cover that decision
- [ ] #4 Linked from README and getting-started
<!-- AC:END -->
