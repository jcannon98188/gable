---
id: TASK-2.17
title: Language service analyzer and gable-check
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 07:40'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.3
parent_task_id: TASK-2
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

The analyzer core (reusing the template parser, type-check blocks run by the real TypeScript checker, positions mapped back to source) and the gable-check CLI, with the value-expression and operator rules and per-rule severity from one tsconfig config. Rules default to strict.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A bad template fails the CLI with a mapped diagnostic
- [x] #2 Severity overrides apply
- [x] #3 Fixtures cover passing and failing templates
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Analyzer and gable-check merged: type-check blocks via the real TS checker, mapped diagnostics, per-rule severity. Uses @typescript/typescript6 API (see NEEDS APPROVAL). Verified on merged integration (152 tests).
<!-- SECTION:FINAL_SUMMARY:END -->
