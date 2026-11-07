---
id: TASK-58
title: 'Vite plugin: i18n extraction and baked per-locale builds'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T04:10:00Z'
updated_date: '2026-11-07T05:04:00Z'
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
- [x] #1 Extraction writes a catalog from templates and tagged templates, with descriptions
- [x] #2 A baked build per locale contains translated static text and no i18n runtime
- [x] #3 Placeholder reordering in translations is honored when baking
- [x] #4 Dev server uses the runtime path and HMR is unaffected
- [x] #5 Missing translations fail or warn per plugin option
- [x] #6 docs/i18n.md covers both modes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. gableI18n plugin (packages/vite/src/i18n): scanner, extraction, catalogs, baking. 2. Per-locale Vite environments for baked output, runtime stripped. 3. Unit + vite build tests. 4. docs/i18n.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
gableI18n plugin in packages/vite/src/i18n (scan, extract, catalogs, bake, plugin), exported from @gable/vite. Baked locales are Vite environments i18n_<locale> built by a custom builder.buildApp into <outDir>/<locale>/; core's i18n-view is stubbed in baked builds so no I18n service or ICU formatter ships. Baked translations support plain placeholders only (plural/select/number/date fail the build, use runtime). Extraction writes core-format JSON (translations, untranslated, obsolete) or XLIFF. Tests: vitest packages/vite packages/core packages/language-service 177/177; tsc packages/vite clean. Not done: language-service i18n-missing-translation rule (needs catalog paths in gable-check config and scanner text positions; left to a follow-up); the .t method on I18n is not extracted or baked; no source map for baked modules; <html lang> per output not set.

Second pass: inject(I18n).t tagged templates (receiver is inject(I18n) or a name containing i18n) are extracted and baked to plain template literals; dynamic calls (i18n.t(...), .translate(...)) stay runtime with a once-per-call plugin warning. <html lang> is set per locale output through transformIndexHtml (bake.htmlLang: false disables). Baked modules now carry source maps via magic-string (added as a dependency of @gable/vite; it is already in Vite's tree; package-lock updated). Decision: ICU plural/select/number/date stay a clear build error in baked mode (html templates cannot call functions, so lowering would mean synthesising computed fields; the runtime handles them in a few KB); recorded in docs/i18n.md and filed as TASK-69 (low). i18n-ignore is removed from baked templates. Verified with unit tests and build integration tests (html lang, .t baking, source map files).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added gableI18n (@gable/vite): extraction of html-template markers and i18n tagged templates to catalogs (JSON or XLIFF, merging with new/obsolete tracking), and baked per-locale builds (dist/<locale>/) that rewrite translated text and attributes with placeholder reordering, strip markers and the i18n runtime, with onMissing error|warn|source. Dev (serve) never transforms, so runtime path and HMR are unchanged. Unit tests (scan, extraction, bake, catalog merge) and vite build integration tests (two locales, missing-translation modes, extraction, dev) pass; docs/i18n.md covers both modes. Follow-ups: language-service missing-translation rule, ICU forms in baked builds, .t extraction.
<!-- SECTION:FINAL_SUMMARY:END -->
