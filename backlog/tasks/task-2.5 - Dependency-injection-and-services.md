---
id: TASK-2.5
title: Dependency injection and services
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:07'
updated_date: '2026-11-05 07:26'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.2
parent_task_id: TASK-2
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

inject with optional, self, skipSelf and host, class and InjectionToken Tokens, useClass/useValue/useFactory/useExisting Providers, a single injector tree, service root scope, and createTestInjector. Services and components have no constructors; Setup is field initialisers only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Providers and inject resolve as specified through createTestInjector
- [x] #2 Child injectors shadow parents correctly
- [x] #3 Constructors in classes are rejected or flagged at runtime in dev
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
DI merged: inject, Tokens, Providers, injector tree, createTestInjector, dev constructor check. Verified by build and test run on the merged branch (61 tests).
<!-- SECTION:FINAL_SUMMARY:END -->
