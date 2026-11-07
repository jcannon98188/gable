---
id: TASK-94
title: 'gable-ui: CodeBlock syntax-highlighting component'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T18:24:00Z'
updated_date: '2026-11-07T18:24:00Z'
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
- [ ] #1 ui-code-block renders code with line numbers, wrap, highlighted lines and an accessible copy button, without innerHTML
- [ ] #2 Built-in tokenizer handles ts/js/tsx/jsx, json, html, css, bash and text; linear time, never throws, round-trips the source
- [ ] #3 Custom highlighter input; registered in index.ts and registry-meta; gallery page code-block.html
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. tokenizer lib + tests 2. code-block component + dom tests 3. register, docs 4. gallery page 5. verify
<!-- SECTION:PLAN:END -->
