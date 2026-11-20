---
kind: ticket
title: Router
status: resolved
blocked_by: [29, 31]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.11 - Router.md
assignee:
  - '@jason'
ordinal: 32000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Navigation, guards, redirects and lazy routes work through mountApp
- [x] #2 Route params bind to inputs
- [x] #3 Failed lazy loads cancel navigation and report to the error path

## Answer

Router, outlet, guards, redirects, lazy routes, routerLink, mountApp; merged.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

Route configuration with nesting, params, wildcards, redirects and route providers; the outlet; router state as signals with Observable twins; automatic param-to-input binding; function guards; navigate returning a Promise of the outcome; routerLink and routerLinkActive; lazy routes sharing lazy(); and mountApp with navigate for tests.
