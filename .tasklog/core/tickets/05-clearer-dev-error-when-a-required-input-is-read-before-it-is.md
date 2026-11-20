---
kind: ticket
title: Clearer dev error when a required input is read before it is bound
status: resolved
tags:
  - dx
  - priority-low
created: 2026-11-06
updated: 2026-11-06
imported_from: backlog/tasks/task-5 - Clearer-dev-error-when-a-required-input-is-read-before-it-is-bound.md
assignee:
  - '@claude'
priority: low
ordinal: 46000
---

## Question

The host-binding ordering bug (fixed: meta.host bindings now apply in render() after the parent binds inputs) surfaced only as 'Required input todo of TodoItem was read before it was set', with no hint that setup timing was the cause. Other reads of a required input from setup-time code (field initialisers, effects created in setup) can still hit this.

## Acceptance criteria

- [x] #1 The error names where the read happened (host binding, setup, effect) and says inputs are bound after setup
- [x] #2 Docs state when a required input may first be read

## Implementation plan

1. input.required: make the error say inputs are bound after setup, and where the read happened (track a read-phase context in a small module-level marker set by setup, effects, host binding, template).
2. Wire the marker in component.ts/effect creation where feasible.
3. Tests in packages/testing/src (errors/composition) for host binding, field initialiser, effect.
4. Short docs section in docs/getting-started.md.

## Implementation notes

Added packages/core/src/read-phase.ts (phase marker set by setup, meta.host binding, effect); input.ts message uses it. Tests in composition.test.ts; docs section in docs/getting-started.md. vitest packages/testing+core: 286 pass.

## Answer

Required-input error now names where the read happened (setup/host binding/effect or template binding) and says inputs are bound after setup. Verified by 4 new tests in packages/testing/src/composition.test.ts (286 tests pass in core+testing). Docs: 'When a required input may first be read' in docs/getting-started.md.
