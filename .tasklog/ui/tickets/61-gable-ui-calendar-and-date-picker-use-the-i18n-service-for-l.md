---
kind: ticket
title: "gable-ui: Calendar and date picker use the I18n service for locale"
status: resolved
tags:
  - ui
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-61 - gable-ui-Calendar-and-date-picker-use-the-I18n-service-for-locale.md
ordinal: 109000
---

## Question

locale now accepts a function returning a date-fns Locale, but nothing reads the I18n service. Wire calendar/date-picker locale (and labels such as previousLabel, Month, Year) to the I18n service once its API settles. Follow-up from ui/50.

## Acceptance criteria

- [x] #1 Calendar and date picker default their locale from the I18n service
- [x] #2 Labels are translatable through the service
- [x] #3 Tests cover a locale change at runtime

## Implementation plan

1. lib/date-locale.ts (I18n locale, Intl names, dateFnsLocaleNames, localeLoader). 2. Wire calendar and date-picker, labels via i18n.t. 3. Tests and docs.

## Implementation notes

Added packages/ui/src/lib/date-locale.ts, registry lib entry date-locale, localeLoader input, docs in ui-primitives.md. Tests in calendar-i18n.dom.test.ts cover a runtime setLocale change, no-provider fallback, and override.

## Answer

Calendar and date picker follow I18n.locale (Intl names, week start), translate labels via ids ui.calendar.* / ui.datePicker.*, keep the date-fns locale input as override and add localeLoader plus dateFnsLocaleNames for date-fns locales. Verified with jsdom and axe tests.
