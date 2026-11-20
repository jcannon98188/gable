---
kind: ticket
title: "Site: live forms, i18n and store demos in the Data section"
status: resolved
tags:
  - parent-97
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-97.3 - Site-live-forms-i18n-and-store-demos-in-the-Data-section.md
assignee:
  - '@claude'
ordinal: 183000
---

## Question

Signal forms, i18n and signal stores are described but never shown working.

## Acceptance criteria

- [x] #1 Signal form with live validation, touched/dirty state and submit
- [x] #2 i18n locale switch re-rendering plurals, numbers and dates at runtime
- [x] #3 A signal store with actions and derived state, with its state visible
- [x] #4 Each demo isolated; a failing one does not break the page

## Implementation notes

Three demos under site/src/demos/data (form-demo, i18n-demo, store-demo, catalogs, css, data.test.ts), each wrapped in gable-error-boundary in data.ts. Verified: 6 unit tests, check -w site, real browser at 5203 (desktop, 360px, light).

## Answer

Added live sign-up form (real @gable/core/forms incl. async + cross-field + submit), runtime I18n demo (en/fr/ar RTL/partial de, plural/select/number/date, catalog and missing list) and @gable/store cart (withState/withComputed/withMethods/withStorage, live getState JSON). Added @gable/store dependency to site. Unrelated failures: router demo tests, typecheck:tests merge conflict in packages/designer, TS error in signals demo.
