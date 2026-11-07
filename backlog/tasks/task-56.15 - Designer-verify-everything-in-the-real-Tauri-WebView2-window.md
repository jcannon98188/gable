---
id: TASK-56.15
title: 'Designer: verify everything in the real Tauri/WebView2 window'
status: To Do
assignee: []
created_date: '2026-11-07T17:34:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 161000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run the existing driven checks (chrome-check, device-check, tailwind-check, polish-check, writers-check, project-check, a11y-diff-check, mcp-check) against the real Tauri window (WebView2, remote debugging via additional_browser_args) on examples/todomvc and examples/ui-gallery, plus window-only items: folder browser and project switch via the Rust host, light-theme compile-error banner, MCP in the window, CDP env toggles (touch, dark, reduced motion). Fix what breaks. macOS/Linux cannot be covered from this machine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each driven check run against the Tauri window; results recorded per check
- [ ] #2 Window-only items verified (project switch, light-theme banner, MCP, CDP emulation)
- [ ] #3 Defects found are fixed or ticketed; tsc, build and full vitest pass
<!-- AC:END -->
