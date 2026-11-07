---
id: TASK-61
title: 'gable-ui: Calendar and date picker use the I18n service for locale'
status: To Do
assignee: []
created_date: '2026-11-07T04:57:00Z'
labels:
  - ui
dependencies: []
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
locale now accepts a function returning a date-fns Locale, but nothing reads the I18n service. Wire calendar/date-picker locale (and labels such as previousLabel, Month, Year) to the I18n service once its API settles. Follow-up from TASK-50.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calendar and date picker default their locale from the I18n service
- [ ] #2 Labels are translatable through the service
- [ ] #3 Tests cover a locale change at runtime
<!-- AC:END -->
