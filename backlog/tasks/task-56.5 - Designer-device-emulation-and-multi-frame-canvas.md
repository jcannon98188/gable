---
id: TASK-56.5
title: 'Designer: device emulation and multi-frame canvas'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:58:00Z'
updated_date: '2026-11-07T05:51:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.3
parent_task_id: TASK-56
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Designs must be checked on mobile, tablet and desktop. Chrome-style device mode is the baseline; seeing several frames at once is the improvement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Frames set width, height and device pixel ratio with fit-to-screen scaling, rotation, presets and custom sizes
- [x] #2 Several frames show at once, each its own app instance, with an option to sync interactions between them
- [x] #3 On Windows WebView2, touch, pointer/hover, color scheme, reduced motion and user agent are emulated over CDP
- [x] #4 On other platforms synthetic touch events are used where possible, and unsupported emulation is labelled in the UI
- [x] #5 Escape hatch to open the page in the system browser against the same dev server
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. CDP experiment (headless Edge): confirm cross-site iframes appear as separate CDP targets and which Emulation calls take effect on them (metrics/DPR, touch, media, UA). Match target to frame by the session nonce the agent keeps in the frame window.name (sessionStorage is shared by same-origin frames).
2. Backend (new src/server/cdp.ts, device-api.ts, settings.ts + small hooks in backend.ts/cli.ts): optional --cdp-port; Node-side CDP client (backend is the CDP client, Rust only enables the port); /api/devices/{capabilities,emulation,settings,open-external}; per-project presets and layout in the user data dir.
3. Rust: on Windows pick a free port, pass to webview additional_browser_args and node --cdp-port. No other Rust.
4. Agent+protocol: synthetic touch (touch events from mouse where TouchEvent exists), DPR report, interaction recording/replay for sync, session in window.name.
5. Shell (new files frames.ts, frame-board.ts; devices.ts shared): Frame model (w/h/dpr/rotation/emulation) on its own *.localhost origin, one PreviewClient per frame, FrameSet with selected frame + width/breakpoint for 56.6, fit-to-screen scale, presets, sync, system-browser button, labels for unsupported emulation. Small edits in designer-state.ts/shell.ts.
6. Tests (vitest for pure logic, api and protocol; e2e/device-check.mjs driven in headless Edge over CDP, without CDP, and in the Tauri/WebView2 window); docs (README, ADR 0002 note).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design decisions and findings:
- Each preview iframe is its own CDP target (type iframe). The backend is the CDP client; Rust only turns on the port (additional_browser_args on Windows, GABLE_CDP_PORT overrides, 0 disables) and passes --cdp-port.
- Emulation.setDeviceMetricsOverride and setEmitTouchEventsForMouse are top-level-only, so size is CSS on the iframe and DPR is only reported to scripts (agent overrides devicePixelRatio); resolution media queries are not emulated and the UI says so. setTouchEmulationEnabled, setEmulatedMedia and setUserAgentOverride work on the iframe target.
- Touch, pointer/hover and media emulation are process-wide: two same-site frames overwrote each other. Fix: frame n runs on f<n>.localhost (slot 0 stays localhost) so each gets its own renderer process and storage. Verified per frame: phone dark+reduced motion while laptop frame stays untouched.
- Frames are told apart over CDP by the nonce in window.name (sessionStorage is shared by same-origin frames; frames got the same nonce before). Edge clears window.name on a cross-site navigation of the frame, same caveat as TASK-56.3 notes.
- Sync = agent records trusted click/input/scroll/Enter/Escape with child-index paths and the shell replays them in the other frames.
- Presets and layout live in the user data dir keyed by project path (the Tauri window origin changes per launch so localStorage cannot be used).
- Emulation requests are serialized per frame in the shell (Frame.applying) so the last edit wins.
- For TASK-56.6: FrameSet.selected, selectedWidth, selectedBreakpoint (Tailwind v4 default breakpoints in devices.ts TAILWIND_BREAKPOINTS; replace with the project own). DesignerState.preview is now a getter for the selected frame client.
- Device bar uses native select/input/checkbox: TODO(gable-ui) swap for gable-ui components.
Verification: vitest packages/designer 21 passed (geometry, settings, device api with stub CDP/opener, protocol window.name, frameUrl); tsc and gable-check clean; cargo check/build ok. e2e/device-check.mjs, 31 checks, all pass in headless Edge with CDP, headless Edge with the backend started without CDP (--no-cdp), and the real Tauri/WebView2 window (GABLE_CDP_PORT=9477, fresh WebView2 data dir). Open in browser verified by hand: endpoint opened Brave (default browser) on the todomvc dev server with query string intact. Not verified: macOS and Linux (no hardware); synthetic touch on WebKit engines.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T04:24:00Z

---

Spike finding: the agent only needs a cross-origin parent, so it carries over to emulation frames. WebView2 remote debugging must be enabled through additional_browser_args (env var ignored); the CDP check script is spikes/designer/cdp-check.mjs on branch t3/4cab3513.

---

created: 2026-11-07T05:22:00Z

---

From TASK-56.3 (merged): component mode and page mode both go through PreviewClient, which owns one iframe. Multi-frame needs one client per frame, each with its own nonce. setMode (select/interact) is already in the protocol. Session binds via ?__gable_designer=nonce|origin URL parameter (Edge clears window.name on cross-site navigation).

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a multi-frame canvas with device emulation to the Designer. Up to six iframe Frames, each its own app instance (own PreviewClient, nonce and *.localhost origin), sized by preset, custom size, rotation and DPR with fit-to-screen scaling; presets and layout saved per project in the user data dir; optional Sync of click/typing/scroll/Enter between frames; Open in browser via a backend endpoint restricted to the project dev server. On Windows WebView2 the Rust host enables a debugging port and the Node backend emulates touch, pointer/hover, color scheme, reduced motion and user agent over CDP, per frame. Elsewhere the agent synthesises touch events and the UI labels what is unsupported.
Verification: vitest (21 pass), tsc and gable-check clean, cargo build ok; e2e/device-check.mjs (31 checks) passes in headless Edge with CDP, with the backend started without CDP (AC4 labels and fallbacks), and in the real Tauri/WebView2 window; Open in browser opened the default browser by hand.
Risks and follow-ups (not created as tasks): macOS and Linux were not run (the no-CDP path was exercised on Windows only; synthetic touch on WebKit is untested); DPR is reported to scripts only, resolution media queries are not emulated; the CDP port is open on loopback in the desktop app; frame session lives in window.name which Edge clears on cross-site navigation; native selects in the device bar should become gable-ui components (TODO(gable-ui)); TASK-56.6 should replace the default Tailwind breakpoints with the project own.
<!-- SECTION:FINAL_SUMMARY:END -->
