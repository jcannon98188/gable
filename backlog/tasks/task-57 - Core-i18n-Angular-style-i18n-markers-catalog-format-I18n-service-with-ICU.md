---
id: TASK-57
title: 'Core i18n: Angular-style i18n markers, catalog format, I18n service with ICU'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T04:10:00Z'
updated_date: '2026-11-07T05:04:00Z'
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
- [x] #1 Markers on elements and attributes resolve against the current catalog at runtime and re-render when the locale signal changes
- [x] #2 ICU plural, select and placeholder reordering work, with tests
- [x] #3 i18n tagged template works in component code and is signal-reactive
- [x] #4 Catalog format documented in docs/i18n.md, usable by the extractor in the Vite plugin task
- [x] #5 Language-service rules for marker misuse and missing translations
- [x] #6 In-memory test harness supports setting a locale and catalog
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure message core (packages/core/src/i18n-message.ts): ICU-style parser/formatter on Intl, ids (FNV-1a 64 over message+description), markers, catalogs (JSON, XLIFF 1.2). 2. Template parser: i18n / i18n-<attr> markers produce I18nInfo on text nodes and i18nAttrs; view builder renders them through the root I18n service in effects. 3. I18n service + i18n tag + provideI18n (@gable/core/i18n subpath; extraction in @gable/core/tooling). 4. @gable/testing: mount({ i18n }) and fixture.i18n. 5. Language-service i18n-* marker rules with fixtures. 6. docs/i18n.md. Missing-translation lint (needs catalog path config and raw-text positions in the scanner) is deferred.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. Message syntax uses backslash escapes rather than ICU apostrophes. i18n tag returns a signal (field initialiser); inject(I18n).t gives a string. Verified: vitest packages/core testing language-service renderer-dom 569/570 pass (the one failure is renderer-dom browser.test viewport trigger, a known flake noted in TASK-38); tsc build configs of core, testing, language-service clean. Not done: AC5 'missing translations' language-service rule (needs a configured catalog path and positions of text in the scanner); unmarked-text opt-in rule.

Second pass: added the language-service i18n-missing-translation rule (warn by default; reads the new i18n section of the @gable/language-service tsconfig plugin entry, same shape as gableI18n; JSON/XLIFF catalogs, mtime-cached; off without an i18n section) and the opt-in i18n-unmarked-text rule (off by default; flags text with letters and static title/placeholder/alt/aria-label; skips whitespace, numbers/punctuation, {{ }}-only text, code/pre/kbd/samp/script/style and elements with i18n-ignore). i18n-ignore is a new attribute: core template parser drops it, the Vite bake removes it, marker rules ignore it. Scanner TextNode gained raw and start. Class-fragment rule trimmed to the + concatenation in [class] (holes are a template-syntax error); fragment-fail fixture updated and holes-fail added for the TASK-30 hole test. Documented in docs/i18n.md. Verified: vitest packages/core language-service vite testing 537/537; tsc --noEmit on the four build configs clean. Deferred: TASK-70 (missing-translation for code messages).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Core i18n complete: markers, ICU message core, catalogs, I18n service, i18n tag, testing harness, and language-service rules (marker misuse, i18n-missing-translation against configured catalogs, opt-in i18n-unmarked-text with i18n-ignore). 537 tests across core, language-service, vite and testing pass; tsc clean. Follow-up: TASK-70.
<!-- SECTION:FINAL_SUMMARY:END -->
