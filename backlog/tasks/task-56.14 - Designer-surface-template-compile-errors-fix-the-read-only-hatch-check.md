---
id: TASK-56.14
title: 'Designer: surface template compile errors; fix the read-only hatch check'
status: To Do
assignee: []
created_date: '2026-11-07T17:01:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 160000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When an edited template fails to compile (e.g. interpolation in an attribute, which Gable rejects: packages/core/src/template.ts:471), the preview keeps running the last good template and the Designer silently shows it with every element hatched as stale. Surface the compile error (Problems tab and/or HMR timeline and a canvas banner naming file, line and message) and say the canvas is showing the last good version. Also fix e2e/polish-check.mjs, which wrote an invalid class='{{ }}' and so never tested the real dynamic-class hatch: use a supported form ([class]=expr or [class.x]=expr) and verify the read-only hatch for it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A template that fails to compile shows its error in the Designer (file, line, message) and a note that the canvas shows the last good version; clears when fixed
- [ ] #2 polish-check uses valid Gable for the dynamic-class case and passes, confirming the read-only hatch (or the hatch/Tailwind read-only behaviour is fixed if it does not appear)
- [ ] #3 Tests added; tsc, designer build and full vitest pass
<!-- AC:END -->
