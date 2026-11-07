---
id: TASK-56.5
title: 'Designer: device emulation and multi-frame canvas'
status: To Do
assignee: []
created_date: '2026-11-07T03:58:00Z'
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
