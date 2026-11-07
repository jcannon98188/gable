---
id: TASK-56.1
title: 'Designer spike: Tauri shell, preview agent and node-to-source mapping'
status: To Do
assignee: []
created_date: '2026-11-07T03:57:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The riskiest assumptions are that a Tauri webview can host the preview well and that a rendered node can be mapped back to its template source range. Prove both before building further.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Tauri shell opens a Gable project folder, starts its Vite dev server and shows the app in a preview iframe
- [ ] #2 A dev-only agent (instrumenting DOM renderer plus DevHooks) reports the component tree to the shell over postMessage
- [ ] #3 Clicking an element in the preview shows the file and exact range of the template node that produced it, on examples/todomvc
- [ ] #4 Findings recorded: whether the runtime template parse retains positions, WebView2 behaviour, and any renderer changes needed in core
- [ ] #5 Spike code is throwaway or clearly marked as such
<!-- AC:END -->
