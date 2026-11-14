---
id: TASK-99.25
title: Run the renderer spike on macOS Metal through CI
status: To Do
assignee: []
created_date: '2026-11-08T01:55:00Z'
labels:
  - wayfinder:task
dependencies: []
parent_task_id: TASK-99
ordinal: 222000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

The renderer spike branch has a workflow_dispatch-only GitHub Actions workflow on macos-latest that has never been run. The maintainer cannot test on a Mac, so run it and record the Metal results (picking, blend, blur and backdrop, text diff, headless goldens) against the same pass criteria as the desktop run. Done when macOS results are recorded or the failures are explained.
<!-- SECTION:DESCRIPTION:END -->
