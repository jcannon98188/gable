---
id: TASK-99.12
title: Platform services for Gable Native
status: To Do
assignee: []
created_date: '2026-11-07T22:09:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-99.7
parent_task_id: TASK-99
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How do the existing Platform-service Tokens (Location, History, Title, Meta, LiveAnnouncer, FocusManager) behave under Gable Native (an in-memory route stack, Android back button and deep links, the window title, Meta as a no-op, LiveAnnouncer and FocusManager mapped onto AccessKit), how are the new Geometry, FrameScheduler and MediaQuery Tokens implemented, and which native-only services need new Tokens (window management, menus including the macOS menu bar and Cmd shortcuts, clipboard, notifications, file dialogs, system theme)? Decide the Token set, which are optional per platform, and the macOS and Android specifics.
<!-- SECTION:DESCRIPTION:END -->
