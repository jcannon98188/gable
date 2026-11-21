---
kind: ticket
title: "@gablejs/store devtools: log actions (method calls), not only patches"
status: resolved
tags:
  - store
  - priority-low
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-65 - gable-store-devtools-log-actions-method-calls-not-only-patches.md
assignee:
  - '@claude'
priority: low
ordinal: 113000
---

## Question

withDevtools only logs patchState changes. Method wrappers are blocked because store members are defined non-configurable; either wrap in withMethods or add an opt-in actions wrapper.

## Implementation notes

withMethods wraps methods only under DEV (instrument() in store.ts); withDevtools registers an action wrapper and logs 'action' entries {name,args,patches,error?}; sync patches grouped, async/rxMethod-pipeline patches stay as 'patch' entries. devtools-prod.test.ts bundles with __GABLE_DEV__ false and asserts devtools code absent.

## Answer

Store devtools now logs actions with args summary and grouped patches; dev-only, dead-code test added; docs/store.md and docs/devtools.md updated.
