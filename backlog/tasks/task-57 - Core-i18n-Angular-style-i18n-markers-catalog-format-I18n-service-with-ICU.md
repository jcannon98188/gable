---
id: TASK-57
title: 'Core i18n: Angular-style i18n markers, catalog format, I18n service with ICU'
status: To Do
assignee: []
created_date: '2026-11-07T04:10:00Z'
labels:
  - core
  - i18n
dependencies: []
priority: medium
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Runtime i18n shared by the baked and runtime modes. Markers: `i18n="description"` on elements, `i18n-<attr>` for attributes (title, placeholder, aria-label...), and an `i18n` tagged template for code. Catalog format (JSON, optionally XLIFF) with ICU plural/select and numbered/named placeholders; translators may reorder placeholders. I18n service with a `locale` signal, catalog loading, reactive re-render on locale change, small ICU formatter on Intl.PluralRules/DateTimeFormat/NumberFormat. `${}` holes in html templates do not exist (TASK-30); the tagged-template form for code is the only place ${} appears. Language-service rules: unmarked user-facing text (opt-in), missing translations, marker misuse.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Markers on elements and attributes resolve against the current catalog at runtime and re-render when the locale signal changes
- [ ] #2 ICU plural, select and placeholder reordering work, with tests
- [ ] #3 i18n tagged template works in component code and is signal-reactive
- [ ] #4 Catalog format documented in docs/i18n.md, usable by the extractor in the Vite plugin task
- [ ] #5 Language-service rules for marker misuse and missing translations
- [ ] #6 In-memory test harness supports setting a locale and catalog
<!-- AC:END -->
