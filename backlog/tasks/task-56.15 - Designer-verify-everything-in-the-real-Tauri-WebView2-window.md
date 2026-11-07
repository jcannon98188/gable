---
id: TASK-56.15
title: 'Designer: verify everything in the real Tauri/WebView2 window'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T17:34:00Z'
updated_date: '2026-11-07T17:55:00Z'
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
- [x] #1 Each driven check run against the Tauri window; results recorded per check
- [x] #2 Window-only items verified (project switch, light-theme banner, MCP, CDP emulation)
- [x] #3 Defects found are fixed or ticketed; tsc, build and full vitest pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build designer + Tauri app; launch the window with GABLE_CDP_PORT, fresh GABLE_DESIGNER_DATA and WEBVIEW2_USER_DATA_FOLDER per run.
2. Run the attachable checks (device, chrome, polish, tailwind, a11y-diff) against the window on todomvc / ui-gallery / a11y-app.
3. Add an attach mode (--port/--shell) to the self-spawning checks (writers, project, mcp) and run them against the window.
4. Window-only items: folder browser and project switch, light-theme compile banner, MCP in the window, CDP emulation toggles.
5. Fix small defects, ticket large ones; tsc, build, vitest.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
todomvc window: device-check 31/31, polish-check (todomvc) all pass after making it start from one frame, writers-check (attach) all pass after its pick avoids todomvc's toggle-all label. Fixed: light-theme compile banner note 3.97:1 -> 5.42:1 (dark 6.73:1). Fixed: MCP session file stayed on the start project after a project switch (stdio proxy could not find the window); test added in project.test.ts.

Window results (Tauri 2 / WebView2, Edge 157, 150% display), all PASS:
- device-check (todomvc): 31/31, twice incl. a fresh window after the rebuild. Covers the CDP toggles per frame: touch (coarse pointer, hover none, 5 points), dark/light, reduced motion, UA, DPR.
- chrome-check (ui-gallery): all pass.
- polish-check: todomvc all pass; ui-gallery --tailwind all pass.
- tailwind-check: ui-gallery --source all pass (hover via CSS.forcePseudoState); todomvc --off 3/3.
- writers-check (new --port/--shell attach, todomvc): all pass.
- project-check (new attach mode, fresh ui-gallery window): all pass. Folder browser, Up, refusal, project switch through the Rust-hosted backend, install, crash/restart, log, palette, recent list.
- a11y-diff-check (window on test-fixtures/a11y-app): all pass.
- mcp-check (new attach mode with --data; switches the window to the fixture and back): phase 1 + stdio all pass, plus new checks (session file follows the switch; clipped screenshot has the frame's size). Phase 2 (no CDP) needs its own backend: skipped when attached, still passes headless.
- Light-theme compile banner: checked on todomvc and ui-gallery in both themes (contrast measured, screenshot reviewed).
Further fixes:
- CDP-clip screenshot on a 150% display was 1920x1200 for a 1280x800 frame: now divides by the shell's devicePixelRatio.
- Closing the window (WM_CLOSE) killed the backend at once, skipping its cleanup (stale MCP session file): main.rs now closes stdin and waits up to 5s before killing.
Headless forms of writers/project/mcp/a11y-diff still pass. Not covered: macOS/Linux; the GABLE_CDP_PORT=0 path inside the window (nothing to drive it with); a sliver of the frame's selection ring in the corners of the clipped screenshot (cosmetic). Note: backend.ts passes options.mcpSessionDir (default: the global data dir), not options.dataDir.
tsc + typecheck:tests clean, designer build and cargo build OK, vitest 1586/1587 with renderer-dom/browser.test.ts the known flake (passes alone; no renderer-dom/core changes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ran all eight driven checks against the real Tauri/WebView2 window (todomvc, ui-gallery, a11y-app), plus the window-only items: folder browser and project switch, light-theme compile banner, MCP in the window, and the CDP touch/dark/reduced-motion toggles. Everything passes.

Fixed in the product:
- Light-theme compile banner note contrast (3.97 -> 5.42:1).
- The MCP session file now follows a project switch (test added).
- The CDP-clipped screenshot is the frame's size on scaled displays.
- Closing the window lets the backend shut down cleanly before it is killed.

Checks:
- writers-check, project-check and mcp-check gained an attach mode (--port/--shell, mcp also --data); usage is documented in the README.
- polish-check and writers-check were made robust to the state a previous check leaves.

Verification: tsc and typecheck:tests are clean; the designer and cargo builds pass; vitest passes apart from the known renderer-dom browser flake, which passes alone.

Not covered: macOS/Linux, and the no-CDP path inside the window. Nothing ticketed.
<!-- SECTION:FINAL_SUMMARY:END -->
