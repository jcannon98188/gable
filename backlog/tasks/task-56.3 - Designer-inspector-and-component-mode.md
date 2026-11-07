---
id: TASK-56.3
title: 'Designer: inspector and component mode'
status: To Do
assignee: []
created_date: '2026-11-07T03:57:00Z'
updated_date: '2026-11-07T04:24:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.1
parent_task_id: TASK-56
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Developers get value from the designer before any editing exists, and component mode (Storybook-style) needs the same agent. Scenarios let states like empty, loading and error be seen without a backend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Shell shows the component tree, injector tree with the Providers behind each Token, and live signal values
- [ ] #2 Component mode mounts a single component in isolation with inputs and provider overrides taken from a scenario
- [ ] #3 Scenarios are plain TypeScript files beside the component, loaded by the shell and runnable by @gable/testing
- [ ] #4 Language-service diagnostics are shown on the canvas element they refer to
- [ ] #5 HMR timeline shows whether each edit was a patch or a re-setup
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T04:24:00Z

---

Spike finding: needs a registry from template node to rendered elements (@for yields many, @if can yield none). Click muting currently stops events at document capture; muting at the renderer listen is more robust. Agent protocol is unversioned and accepts any origin: add a version and origin/nonce check. Decide whether design tooling gets its own core entry point rather than growing the devtools hook.

---
<!-- COMMENTS:END -->
