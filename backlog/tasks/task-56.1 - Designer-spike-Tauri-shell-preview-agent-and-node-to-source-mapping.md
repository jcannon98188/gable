---
id: TASK-56.1
title: 'Designer spike: Tauri shell, preview agent and node-to-source mapping'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:57:00Z'
updated_date: '2026-11-07T04:24:00Z'
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
- [x] #1 A Tauri shell opens a Gable project folder, starts its Vite dev server and shows the app in a preview iframe
- [x] #2 A dev-only agent (instrumenting DOM renderer plus DevHooks) reports the component tree to the shell over postMessage
- [x] #3 Clicking an element in the preview shows the file and exact range of the template node that produced it, on examples/todomvc
- [x] #4 Findings recorded: whether the runtime template parse retains positions, WebView2 behaviour, and any renderer changes needed in core
- [x] #5 Spike code is throwaway or clearly marked as such
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Spike committed as bc57470 on branch t3/4cab3513 (worktree C:\Users\Jason\.t3\worktrees\gable\t3-4cab3513). Details in spikes/designer/FINDINGS.md on that branch. Core changes are dev-gated: ElementNode.pos in template.ts, DevtoolsSink.element in dev-hooks.ts, one call in view.ts, hook.templateSourceOf in devtools.ts, one test. WebView2 gotchas: build the window from a spawned thread (blocking in setup hangs), shared data folder means a stale instance with other browser args wins, Vite binds localhost IPv6 only, remote debugging needs additional_browser_args. Not verified: clicking a @for item inside the Tauri window (checked in a plain browser only). Unrelated: packages/renderer-dom/src/browser.test.ts is flaky on this machine (4 of 8 baseline runs).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Proved the riskiest assumptions: a Tauri 2 shell on WebView2 hosts the project own Vite preview, and clicking a rendered element reports the exact range inside the html literal (todo-app.ts 15:11-22:13; todo-item.ts 15:9-15:65, still correct after an HMR edit). Runtime template parse had no positions; added element-only positions behind DEV. Changes to core are small and dev-gated. Findings feed the write-back, inspector, emulation and Tailwind tasks (see comments).
<!-- SECTION:FINAL_SUMMARY:END -->
