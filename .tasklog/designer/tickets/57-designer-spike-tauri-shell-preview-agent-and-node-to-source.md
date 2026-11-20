---
kind: ticket
title: "Designer spike: Tauri shell, preview agent and node-to-source mapping"
status: resolved
tags:
  - needs-triage
  - parent-56
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-56.1 - Designer-spike-Tauri-shell-preview-agent-and-node-to-source-mapping.md
assignee:
  - '@claude'
ordinal: 98000
---

## Question

The riskiest assumptions are that a Tauri webview can host the preview well and that a rendered node can be mapped back to its template source range. Prove both before building further.

## Acceptance criteria

- [x] #1 A Tauri shell opens a Gable project folder, starts its Vite dev server and shows the app in a preview iframe
- [x] #2 A dev-only agent (instrumenting DOM renderer plus DevHooks) reports the component tree to the shell over postMessage
- [x] #3 Clicking an element in the preview shows the file and exact range of the template node that produced it, on examples/todomvc
- [x] #4 Findings recorded: whether the runtime template parse retains positions, WebView2 behaviour, and any renderer changes needed in core
- [x] #5 Spike code is throwaway or clearly marked as such

## Implementation notes

Spike committed as bc57470 on branch t3/4cab3513 (worktree C:\Users\Jason\.t3\worktrees\gable\t3-4cab3513). Details in spikes/designer/FINDINGS.md on that branch. Core changes are dev-gated: ElementNode.pos in template.ts, DevtoolsSink.element in dev-hooks.ts, one call in view.ts, hook.templateSourceOf in devtools.ts, one test. WebView2 gotchas: build the window from a spawned thread (blocking in setup hangs), shared data folder means a stale instance with other browser args wins, Vite binds localhost IPv6 only, remote debugging needs additional_browser_args. Not verified: clicking a @for item inside the Tauri window (checked in a plain browser only). Unrelated: packages/renderer-dom/src/browser.test.ts is flaky on this machine (4 of 8 baseline runs).

## Answer

Proved the riskiest assumptions: a Tauri 2 shell on WebView2 hosts the project own Vite preview, and clicking a rendered element reports the exact range inside the html literal (todo-app.ts 15:11-22:13; todo-item.ts 15:9-15:65, still correct after an HMR edit). Runtime template parse had no positions; added element-only positions behind DEV. Changes to core are small and dev-gated. Findings feed the write-back, inspector, emulation and Tailwind tasks (see comments).
