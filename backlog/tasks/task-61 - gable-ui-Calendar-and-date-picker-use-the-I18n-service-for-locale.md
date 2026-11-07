---
id: TASK-61
title: 'gable-ui: Calendar and date picker use the I18n service for locale'
status: Done
assignee: []
created_date: '2026-11-07T04:57:00Z'
updated_date: '2026-11-07T05:31:00Z'
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
- [x] #1 Calendar and date picker default their locale from the I18n service
- [x] #2 Labels are translatable through the service
- [x] #3 Tests cover a locale change at runtime
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. lib/date-locale.ts (I18n locale, Intl names, dateFnsLocaleNames, localeLoader). 2. Wire calendar and date-picker, labels via i18n.t. 3. Tests and docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added packages/ui/src/lib/date-locale.ts, registry lib entry date-locale, localeLoader input, docs in ui-primitives.md. Tests in calendar-i18n.dom.test.ts cover a runtime setLocale change, no-provider fallback, and override.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Calendar and date picker follow I18n.locale (Intl names, week start), translate labels via ids ui.calendar.* / ui.datePicker.*, keep the date-fns locale input as override and add localeLoader plus dateFnsLocaleNames for date-fns locales. Verified with jsdom and axe tests.
<!-- SECTION:FINAL_SUMMARY:END -->
