---
id: TASK-56.5
title: 'Designer: device emulation and multi-frame canvas'
status: To Do
assignee: []
created_date: '2026-11-07T03:58:00Z'
updated_date: '2026-11-07T05:22:00Z'
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
- [ ] #1 Frames set width, height and device pixel ratio with fit-to-screen scaling, rotation, presets and custom sizes
- [ ] #2 Several frames show at once, each its own app instance, with an option to sync interactions between them
- [ ] #3 On Windows WebView2, touch, pointer/hover, color scheme, reduced motion and user agent are emulated over CDP
- [ ] #4 On other platforms synthetic touch events are used where possible, and unsupported emulation is labelled in the UI
- [ ] #5 Escape hatch to open the page in the system browser against the same dev server
<!-- AC:END -->

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
