---
kind: ticket
title: ">-\n  @gable/store: signalStore, withState, withComputed, withMethods, withHooks,\n  patchState"
status: resolved
tags:
  - store
  - ready-for-agent
  - priority-high
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-31 - gable-store-signalStore-withState-withComputed-withMethods-withHooks-patchState.md
assignee:
  - '@claude'
priority: high
ordinal: 72000
---

## Question

A SignalStore-style state library for Gable as new package @gable/store, built on core signals, computed, inject() and scopes with no core changes. Match NgRx SignalStore names for familiarity but adjust to Gable design where appropriate (DI via static scope and providers, no decorators, templates read signals only). Provides signalStore(...features), withState with deep signals (store.user.name()), withComputed, withMethods, withHooks (onInit, onDestroy tied to the component or injector scope), patchState, getState. Decide and document how deep signals are built (proxy vs generated) and how much type inference to keep; prefer a smaller typing surface over fragile inference.

## Acceptance criteria

- [x] #1 signalStore composes the listed features with typed members, usable via inject() and as root or component provided store
- [x] #2 State is readable as deep signals and writable only through patchState; computed and methods work with templates (no method calls needed in value expressions)
- [x] #3 withHooks onInit and onDestroy run with the store lifecycle; tests on the in-memory renderer; docs/store.md documents the API and the design decisions

## Implementation plan

1. New package packages/store (@gable/store) wired into workspace (build script, vitest alias, lockfile). 2. Implement signalStore/withState/withComputed/withMethods/withHooks/patchState/getState: lazy Proxy deep signals, class without constructor, scope-tied hooks. 3. Type tests (expectTypeOf) + runtime tests on in-memory renderer. 4. docs/store.md.

## Implementation notes

Implemented packages/store/src/store.ts (+ index.ts). Tests: npx vitest run packages/store (17 passed: types, state/patchState, scopes, hooks, components on in-memory renderer); tsc -p packages/store/tsconfig.json and tsconfig.build.json clean. Decisions in docs/store.md: lazy Proxy deep signals (plain objects only), overloads for 1-8 features, store is a constructor-less class (static scope='root' replaces providedIn), duplicate member names throw. Not done (other tasks): rxMethod, withEntities/signalStoreFeature, HMR, devtools.

## Answer

Added @gable/store with signalStore, withState, withComputed, withMethods, withHooks, patchState, getState; deep signals via lazy Proxy; read-only state; hooks tied to the owning scope. 17 tests pass, tsc clean, docs/store.md written. Limits: max 8 features per signalStore; deep typing for union-with-null is plain-signal.
