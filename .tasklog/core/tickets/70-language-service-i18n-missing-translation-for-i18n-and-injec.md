---
kind: ticket
title: ">-\n  Language service: i18n-missing-translation for i18n and inject(I18n).t calls\n  in code"
status: resolved
tags:
  - language-service
  - i18n
  - priority-low
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-70 - Language-service-i18n-missing-translation-for-i18n-and-injectI18n.t-calls-in-code.md
assignee:
  - '@claude'
priority: low
ordinal: 118000
---

## Question

i18n-missing-translation (core/57) checks only markers in html templates, via the i18n section of the gable-check config. Extend it to i18n tagged templates and inject(I18n).t tagged templates in TypeScript sources (needs the source-file walker in source-rules, reusing messageFromStrings and the same catalog reader).

## Answer

i18n-missing-translation now also checks i18n tagged templates and .t tagged templates on the I18n service in TypeScript sources (i18nSourceRules, TS AST, same messageFromStrings/messageId as the extractor, same i18n config section; off without it). Fixture i18n-missing-code and tests; docs/i18n.md updated.
