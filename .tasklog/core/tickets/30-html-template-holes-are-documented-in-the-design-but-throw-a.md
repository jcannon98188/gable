---
kind: ticket
title: "html template holes (${}) are documented in the design but throw at runtime"
status: resolved
tags:
  - core
  - needs-triage
  - priority-low
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-30 - html-template-holes-are-documented-in-the-design-but-throw-at-runtime.md
priority: low
ordinal: 71000
---

## Question

gable-v0/06 says reusable fragments are html values passed through ${} holes, but parseTemplate in packages/core/src/template.ts throws 'holes (${}) are not supported yet'. Decide whether to implement holes (fragments) or correct the design note. Found in ui/24; not blocking the ui work, which uses small row components instead.

## Implementation notes

Decision: drop holes. Updated gable-v0/06 (comment), docs/ui-items.md and the parseTemplate error message. Language service still parses holes; a follow-up could flag them.

## Answer

Holes dropped from the design: templates are static strings, reuse via components/projection. Error message and docs updated.
