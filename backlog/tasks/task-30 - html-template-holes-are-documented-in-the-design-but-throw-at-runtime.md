---
id: TASK-30
title: html template holes (${}) are documented in the design but throw at runtime
status: To Do
assignee: []
created_date: '2026-11-07T02:46:00Z'
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
