---
id: TASK-56.2
title: Record designer ADR and glossary terms
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:57:00Z'
updated_date: '2026-11-07T04:09:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Tauri-shell and source-as-truth decisions are costly to reverse and non-obvious, and the designer introduces new domain terms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/adr contains an ADR for the Tauri shell, thin Rust layer and project-owned Vite, and one for source files as the truth
- [x] #2 GLOSSARY.md defines Designer, Agent, Scenario and Frame without drifting from existing terms
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wrote docs/adr/0001-source-files-are-the-design-source-of-truth.md, docs/adr/0002-designer-is-a-tauri-shell-over-the-projects-own-vite.md and a Designer section in GLOSSARY.md (Designer, Preview agent, Scenario, Frame).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recorded the two designer decisions as ADRs and added four glossary terms. Docs only; no code changed.
<!-- SECTION:FINAL_SUMMARY:END -->
