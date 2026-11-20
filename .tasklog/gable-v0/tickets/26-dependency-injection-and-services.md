---
kind: ticket
title: Dependency injection and services
status: resolved
blocked_by: [23]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.5 - Dependency-injection-and-services.md
assignee:
  - '@jason'
ordinal: 26000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Providers and inject resolve as specified through createTestInjector
- [x] #2 Child injectors shadow parents correctly
- [x] #3 Constructors in classes are rejected or flagged at runtime in dev

## Answer

DI merged: inject, Tokens, Providers, injector tree, createTestInjector, dev constructor check. Verified by build and test run on the merged branch (61 tests).

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

inject with optional, self, skipSelf and host, class and InjectionToken Tokens, useClass/useValue/useFactory/useExisting Providers, a single injector tree, service root scope, and createTestInjector. Services and components have no constructors; Setup is field initialisers only.
