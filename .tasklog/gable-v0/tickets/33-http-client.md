---
kind: ticket
title: HTTP client
status: resolved
blocked_by: [26, 28]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.12 - HTTP-client.md
assignee:
  - '@jason'
ordinal: 33000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Requests, interceptors and errors behave as specified under test
- [x] #2 Unmatched requests fail the test at teardown
- [x] #3 Unsubscribing aborts the request without an error

## Answer

Http, interceptors, HttpError, fetch backend, recording fake; merged.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The Http class returning cold Observables that abort on unsubscribe, function interceptors layered by injector depth, a typed HttpError, a swappable HttpBackend Token defaulting to fetch, and the recording fake with expectOne, expectNone, match and verify installed by default in the harness.
