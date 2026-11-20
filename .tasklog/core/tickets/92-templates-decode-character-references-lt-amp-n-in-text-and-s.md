---
kind: ticket
title: ">-\n  Templates: decode character references (&lt; &amp; &#N;) in text and static\n  attributes"
status: resolved
tags:
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-92 - Templates-decode-character-references-lt-amp-N-in-text-and-static-attributes.md
priority: medium
ordinal: 153000
---

## Question

Reported by the designer shell: &lt; and similar are not decoded in html templates, so writing a literal < in text shows the entity. It is a template-format issue (core parser, i18n extraction, the formatter and the language service must agree).

## Acceptance criteria

- [x] #1 The core template parser decodes named (lt, gt, amp, quot, apos, nbsp) and numeric (&#N; &#xH;) character references in text and static attribute values, not inside {{ }} interpolations and not for lone ampersands
- [x] #2 i18n message extraction and baking keep working with decoded text (a message containing &lt; round-trips)
- [x] #3 The formatter (template-format / prettier plugin) leaves entities as written and the language service raises no false errors
- [x] #4 Docs updated and tests in core, the Vite i18n plugin and template-format

## Implementation plan

Add core/src/entities.ts (decode/encode); decode static text + static attr values in the template parser (not {{ }}, not bindings/events/host metadata); i18n messages from decoded text; bake encodes < and reference-like & back; language-service i18n rules decode; tests + docs.

## Implementation notes

Decision: messages/ids/catalogs hold decoded text; bake writes < as &lt; and reference-like & as &amp; so round-trips. Removed the 'translation contains <' bake error. Language-service diagnostics use its own source-offset scanner, so positions are unaffected; only i18n-unmarked-text/missing-translation now decode. Verification: full vitest run 1492/1493, only packages/renderer-dom/src/browser.test.ts (headless Chrome) fails intermittently, passing/failing alternately with and without this change; typecheck:tests and build clean.

## Answer

Core parser decodes named and numeric character references in static text and static attribute values (entities.ts); {{ }}, bindings, events, lone & untouched. i18n extraction/bake/language-service use decoded messages; bake re-encodes. Formatter keeps entities as written (tests added). Tests in core, vite i18n, template-format, language-service; docs in README and docs/i18n.md. Risk: headless-browser test is flaky.
