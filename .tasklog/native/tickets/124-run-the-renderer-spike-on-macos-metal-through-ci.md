---
kind: ticket
title: Run the renderer spike on macOS Metal through CI
status: open
type: task
tags:
  - parent-99
created: 2026-11-08
updated: 2026-11-08
imported_from: backlog/tasks/task-99.25 - Run-the-renderer-spike-on-macOS-Metal-through-CI.md
ordinal: 222000
---

## Question

The renderer spike branch has a workflow_dispatch-only GitHub Actions workflow on macos-latest that has never been run. The maintainer cannot test on a Mac, so run it and record the Metal results (picking, blend, blur and backdrop, text diff, headless goldens) against the same pass criteria as the desktop run. Done when macOS results are recorded or the failures are explained.
