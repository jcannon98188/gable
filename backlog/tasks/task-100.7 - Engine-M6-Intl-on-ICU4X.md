---
id: TASK-100.7
title: 'Engine M6: Intl on ICU4X'
status: To Do
assignee: []
created_date: '2026-11-07T22:36:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.6
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 208000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gable core already needs DateTimeFormat, NumberFormat and PluralRules; the rest of ECMA-402 follows. Spec section 2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ICU4X sits behind a seam crate; locale data is trimmed to configured app locales
- [ ] #2 DateTimeFormat, NumberFormat and PluralRules pass their test262 intl402 directories, then the other ECMA-402 built-ins and toLocale* methods; intl402 is reported separately from the ES2025 gate
<!-- AC:END -->
