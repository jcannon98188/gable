---
id: TASK-2.12
title: HTTP client
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 08:27'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.5
  - TASK-2.7
parent_task_id: TASK-2
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The Http class returning cold Observables that abort on unsubscribe, function interceptors layered by injector depth, a typed HttpError, a swappable HttpBackend Token defaulting to fetch, and the recording fake with expectOne, expectNone, match and verify installed by default in the harness.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Requests, interceptors and errors behave as specified under test
- [x] #2 Unmatched requests fail the test at teardown
- [x] #3 Unsubscribing aborts the request without an error
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Http, interceptors, HttpError, fetch backend, recording fake; merged.
<!-- SECTION:FINAL_SUMMARY:END -->
