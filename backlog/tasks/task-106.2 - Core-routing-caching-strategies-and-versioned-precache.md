---
id: TASK-106.2
title: 'Core: routing, caching strategies and versioned precache'
status: To Do
assignee: []
created_date: '2026-11-13T19:56:00Z'
labels: []
dependencies:
  - TASK-106.1
parent_task_id: TASK-106
ordinal: 263000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The authoring API is the base the default worker and any custom worker build on. Atomic install and activation of a versioned precache is the part apps get wrong most often.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Routes match by URL pattern, method and request destination
- [ ] #2 Cache-first, network-first, stale-while-revalidate and network-only strategies behave per spec in tests
- [ ] #3 A precache manifest installs a version fully or not at all, and never serves a mix of two versions
- [ ] #4 Old version caches are removed on activation
<!-- AC:END -->
