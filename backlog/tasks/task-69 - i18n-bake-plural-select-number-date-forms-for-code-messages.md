---
id: TASK-69
title: 'i18n: bake plural/select/number/date forms for code messages'
status: To Do
assignee: []
created_date: '2026-11-07T05:04:00Z'
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
