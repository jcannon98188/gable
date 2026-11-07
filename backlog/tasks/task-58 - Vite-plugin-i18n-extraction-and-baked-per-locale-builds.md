---
id: TASK-58
title: 'Vite plugin: i18n extraction and baked per-locale builds'
status: To Do
assignee: []
created_date: '2026-11-07T04:10:00Z'
updated_date: '2026-11-07T04:10:00Z'
labels:
  - vite
  - i18n
dependencies:
  - TASK-57
priority: medium
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Optional build-time transform in packages/vite, for people who want Angular-style compile-time translations. Extract: scan html templates and i18n tagged templates for markers and write the message catalog (core i18n format). Bake: rewrite the static text and marked attributes of the template literals to the translated strings, once per locale, reordering placeholders as the translation requires; emit one output per locale with no i18n runtime shipped. Dev always uses the runtime path so HMR keeps working. Marked content must be static text (no ${} holes in html templates, TASK-30); hole-like placeholders only exist in the i18n tagged template for code. Mark whole sentences, not fragments. Hosting and routing by locale (/fr/) is out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extraction writes a catalog from templates and tagged templates, with descriptions
- [ ] #2 A baked build per locale contains translated static text and no i18n runtime
- [ ] #3 Placeholder reordering in translations is honored when baking
- [ ] #4 Dev server uses the runtime path and HMR is unaffected
- [ ] #5 Missing translations fail or warn per plugin option
- [ ] #6 docs/i18n.md covers both modes
<!-- AC:END -->
