---
id: TASK-30
title: html template holes (${}) are documented in the design but throw at runtime
status: Done
assignee: []
created_date: '2026-11-07T02:46:00Z'
updated_date: '2026-11-07T04:05:00Z'
labels:
  - core
  - needs-triage
dependencies: []
priority: low
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-1.4 says reusable fragments are html values passed through ${} holes, but parseTemplate in packages/core/src/template.ts throws 'holes (${}) are not supported yet'. Decide whether to implement holes (fragments) or correct the design note. Found in TASK-24; not blocking the ui work, which uses small row components instead.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: drop holes. Updated TASK-1.4 (comment), docs/ui-items.md and the parseTemplate error message. Language service still parses holes; a follow-up could flag them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Holes dropped from the design: templates are static strings, reuse via components/projection. Error message and docs updated.
<!-- SECTION:FINAL_SUMMARY:END -->
