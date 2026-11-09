---
id: TASK-103.13
title: 'Optional crates: TypeScript type stripping and a Node-style module resolver'
status: To Do
assignee: []
created_date: '2026-11-09T02:15:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-103
ordinal: 248000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Separate crates, outside the core engine, for developer convenience: TypeScript type stripping before parse (as Node does, no type checking) and a Node-style module resolver and compat layer (package.json exports, node_modules lookup) on the host module-loading interface. Decide first whether they belong in AgniJS or in embedder projects, and keep the engine free of both. Model: Opus.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A short ADR decides scope and ownership of type stripping and a module resolver
- [ ] #2 If in scope: each is a separate crate with tests against a documented fixture set, and the engine core gains no dependency on them
<!-- AC:END -->
