---
id: TASK-70
title: >-
  Language service: i18n-missing-translation for i18n and inject(I18n).t calls
  in code
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T05:04:00Z'
updated_date: '2026-11-07T05:32:00Z'
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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
i18n-missing-translation now also checks i18n tagged templates and .t tagged templates on the I18n service in TypeScript sources (i18nSourceRules, TS AST, same messageFromStrings/messageId as the extractor, same i18n config section; off without it). Fixture i18n-missing-code and tests; docs/i18n.md updated.
<!-- SECTION:FINAL_SUMMARY:END -->
