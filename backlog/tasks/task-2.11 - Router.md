---
id: TASK-2.11
title: Router
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 08:46'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.8
  - TASK-2.10
parent_task_id: TASK-2
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

Route configuration with nesting, params, wildcards, redirects and route providers; the outlet; router state as signals with Observable twins; automatic param-to-input binding; function guards; navigate returning a Promise of the outcome; routerLink and routerLinkActive; lazy routes sharing lazy(); and mountApp with navigate for tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Navigation, guards, redirects and lazy routes work through mountApp
- [x] #2 Route params bind to inputs
- [x] #3 Failed lazy loads cancel navigation and report to the error path
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Router, outlet, guards, redirects, lazy routes, routerLink, mountApp; merged.
<!-- SECTION:FINAL_SUMMARY:END -->
