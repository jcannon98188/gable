---
id: TASK-37
title: 'Language service: accessibility lint rules for templates'
status: Done
assignee: []
created_date: '2026-11-07T03:29:00Z'
updated_date: '2026-11-07T03:37:00Z'
labels:
  - a11y
  - language-service
  - ready-for-agent
dependencies: []
priority: medium
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add template rules to the existing rule engine (packages/language-service): missing alt on img, inputs and buttons without an accessible name or label, invalid ARIA roles and attributes, click handlers on non-interactive elements without role and key handling, positive tabindex, headings out of order within a component, and autofocus misuse. Each rule has a config key, default severity, docs and fixtures, like the existing rules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rules implemented with config keys, severities and fixtures, covering the cases listed
- [x] #2 Rules documented in docs/getting-started.md or a dedicated a11y doc and reported by gable-check
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added packages/language-service/src/a11y-rules.ts (7 rules, warn by default: a11y-img-alt, a11y-control-name, a11y-aria-valid, a11y-click-key, a11y-tabindex-positive, a11y-heading-order, a11y-autofocus), wired in analyze.ts. Scanner now keeps static text as TextNode with empty exprs. Base fixture tsconfig turns a11y rules off so older fixtures stay clean; a11y-pass/a11y-fail fixtures enable them. Docs: docs/accessibility.md, linked from getting-started.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Seven template a11y rules with config keys, warn severity, pass/fail fixtures, tests in file-rules.test.ts and docs/accessibility.md. Language-service vitest (97) and tsc pass.
<!-- SECTION:FINAL_SUMMARY:END -->
