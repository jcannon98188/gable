---
id: TASK-94
title: 'gable-ui: CodeBlock syntax-highlighting component'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T18:24:00Z'
updated_date: '2026-11-07T18:35:00Z'
labels: []
dependencies: []
ordinal: 164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
gable-ui has no way to show source code with syntax colours (no highlighter, no dependency). A dependency-free ui-code-block component and tokenizer, with a hook to plug in Shiki or similar.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ui-code-block renders code with line numbers, wrap, highlighted lines and an accessible copy button, without innerHTML
- [x] #2 Built-in tokenizer handles ts/js/tsx/jsx, json, html, css, bash and text; linear time, never throws, round-trips the source
- [x] #3 Custom highlighter input; registered in index.ts and registry-meta; gallery page code-block.html
- [x] #4 Diffs: language=diff parses unified text (marker gutter, hunk line numbers), oldCode/newCode computes a Myers line diff with collapsed context, layout split
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. tokenizer lib + tests 2. code-block component + dom tests 3. register, docs 4. gallery page 5. verify
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Class is UiCodeBlock (Ui prefix like siblings). Verified: vitest packages/ui 521 pass (tokenizer, diff, jsdom), gallery 36 pass + tsc, root build and typecheck:tests clean, checked in real browser. No gallery nav link added (gallery has no page nav).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added dependency-free ui-code-block with tokenizer (ts/tsx/js/jsx/json/html/css/bash/text), custom highlighter input, copy button, line numbers/highlights/wrap, and diff support (parsed unified diff, computed Myers diff, split layout). Registered in index/registry-meta, docs updated, gallery page code-block.html added. Not covered: word-level diffs, expanding collapsed hunks.
<!-- SECTION:FINAL_SUMMARY:END -->
