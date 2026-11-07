---
id: TASK-70
title: >-
  Language service: i18n-missing-translation for i18n and inject(I18n).t calls
  in code
status: To Do
assignee: []
created_date: '2026-11-07T05:04:00Z'
labels:
  - language-service
  - i18n
dependencies: []
priority: low
ordinal: 118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
i18n-missing-translation (TASK-57) checks only markers in html templates, via the i18n section of the gable-check config. Extend it to i18n tagged templates and inject(I18n).t tagged templates in TypeScript sources (needs the source-file walker in source-rules, reusing messageFromStrings and the same catalog reader).
<!-- SECTION:DESCRIPTION:END -->
