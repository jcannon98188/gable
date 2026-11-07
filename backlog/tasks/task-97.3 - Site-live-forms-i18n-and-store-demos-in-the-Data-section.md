---
id: TASK-97.3
title: 'Site: live forms, i18n and store demos in the Data section'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T20:29:00Z'
updated_date: '2026-11-07T20:44:00Z'
labels: []
dependencies: []
parent_task_id: TASK-97
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Signal forms, i18n and signal stores are described but never shown working.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Signal form with live validation, touched/dirty state and submit
- [x] #2 i18n locale switch re-rendering plurals, numbers and dates at runtime
- [x] #3 A signal store with actions and derived state, with its state visible
- [x] #4 Each demo isolated; a failing one does not break the page
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Three demos under site/src/demos/data (form-demo, i18n-demo, store-demo, catalogs, css, data.test.ts), each wrapped in gable-error-boundary in data.ts. Verified: 6 unit tests, check -w site, real browser at 5203 (desktop, 360px, light).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added live sign-up form (real @gable/core/forms incl. async + cross-field + submit), runtime I18n demo (en/fr/ar RTL/partial de, plural/select/number/date, catalog and missing list) and @gable/store cart (withState/withComputed/withMethods/withStorage, live getState JSON). Added @gable/store dependency to site. Unrelated failures: router demo tests, typecheck:tests merge conflict in packages/designer, TS error in signals demo.
<!-- SECTION:FINAL_SUMMARY:END -->
