---
id: TASK-97.4
title: 'Site: live router demo'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T20:29:00Z'
updated_date: '2026-11-07T20:48:00Z'
labels: []
dependencies: []
parent_task_id: TASK-97
ordinal: 184000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The router (nested routes, params, lazy, guards) is never shown.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A mini app with its own in-memory router (does not touch the site URL) demonstrates nested routes, params and a guard or lazy route, with the current route state visible
- [x] #2 Delivered as a site-router-demo component ready to wire into the Framework section
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In-memory Location/History (MemoryNav) provided in the component's own injector so the Router never touches the page URL. 2. Mini app: nested routes + outlet, :id param, query tab, canActivate guard redirecting to /login, lazy /reports, ** route. 3. site-router-demo with address bar, back/forward, live state panel read from the Router (url, params, query, matched levels via levelAt, history, events). 4. Tests, build, check, browser verification.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added site/src/demos/router/: site-router-demo (RouterDemo) embedding a mini app with its own Router. Location/History are an in-memory MemoryNav provided via meta.providers in the component's own injector (Title/Meta/LiveAnnouncer/FocusManager provided as null), so neither the page URL nor the site router is touched. Mini app: nested routes with outlet, /users/:id, ?tab query, canActivate guard redirecting to /login?next=admin, lazy /reports (900 ms artificial delay), ** route, redirectTo. State panel reads url/params/queryParams/navigating, rendered levels (router.levelAt), history stack and router.events$ from the real Router; address bar, back/forward, error boundary, light/dark, mobile, reduced motion. Verified: 10 vitest tests, tsc and gable-check clean for these files, typecheck:tests passes, and a real browser run (guard, lazy load, params, back, page pathname unchanged, light theme, 375px). Note: gable-check cannot see core's routerLink selectors from dist typings, so links.ts subclasses the directives with literal selectors.
<!-- SECTION:FINAL_SUMMARY:END -->
