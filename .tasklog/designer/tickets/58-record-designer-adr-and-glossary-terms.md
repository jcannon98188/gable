---
kind: ticket
title: Record designer ADR and glossary terms
status: resolved
tags:
  - needs-triage
  - parent-56
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-56.2 - Record-designer-ADR-and-glossary-terms.md
assignee:
  - '@claude'
ordinal: 99000
---

## Question

The Tauri-shell and source-as-truth decisions are costly to reverse and non-obvious, and the designer introduces new domain terms.

## Acceptance criteria

- [x] #1 docs/adr contains an ADR for the Tauri shell, thin Rust layer and project-owned Vite, and one for source files as the truth
- [x] #2 GLOSSARY.md defines Designer, Agent, Scenario and Frame without drifting from existing terms

## Implementation notes

Wrote docs/adr/0001-source-files-are-the-design-source-of-truth.md, docs/adr/0002-designer-is-a-tauri-shell-over-the-projects-own-vite.md and a Designer section in GLOSSARY.md (Designer, Preview agent, Scenario, Frame).

## Answer

Recorded the two designer decisions as ADRs and added four glossary terms. Docs only; no code changed.
