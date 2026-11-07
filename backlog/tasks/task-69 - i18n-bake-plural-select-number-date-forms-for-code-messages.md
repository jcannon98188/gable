---
id: TASK-69
title: 'i18n: bake plural/select/number/date forms for code messages'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T05:04:00Z'
updated_date: '2026-11-07T05:32:00Z'
labels:
  - vite
  - i18n
dependencies: []
priority: low
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Baked builds fail for translations that use ICU plural, select, number or date forms (decision recorded in docs/i18n.md: templates cannot call functions, so html-template messages cannot be lowered without synthesising computed fields). Possible narrower scope: lower the forms only for i18n and inject(I18n).t tagged templates in code to an inline Intl.PluralRules helper that does not pull the I18n service. Do it only if bundle size or runtime-less deployments demand it; runtime mode already handles these forms.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Code messages (i18n tag, inject(I18n).t) now bake plural, selectordinal, select, number and date forms as inline Intl code (per-module helpers __gablePlural/__gableNum/__gableDate, only those used); no ICU parser or I18n service in the bundle. Decision: html template and attribute messages still fail with a clear message (templates cannot call functions; no clean lowering). core exports numberFormatOptions/dateFormatOptions shared with the runtime formatter. Tests: unit per form (plural, offset, ordinal, select, nested, number, date) plus a build test asserting no ICU parser in the bundle. docs/i18n.md updated.
<!-- SECTION:FINAL_SUMMARY:END -->
