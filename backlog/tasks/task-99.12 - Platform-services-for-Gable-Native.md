---
id: TASK-99.12
title: Platform services for Gable Native
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T22:09:00Z'
updated_date: '2026-11-07T22:53:00Z'
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

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-07T22:53:00Z

---

Resolved with the user. Existing Tokens under native: Location and History are an in-memory route stack (initial href is the launch deep link or /; a deep link arriving while running fires Location.subscribe; no URL bar; Alt+Left, Cmd+[ and mouse back/forward buttons call History.back/forward unless an app handler cancels; on Android the stack is saved and restored across process death); Title sets the window title (the task label on Android); Meta is a no-op; LiveAnnouncer uses AccessKit live regions with a per-platform announcement fallback to be found when the accessibility bridge is built, contract unchanged; FocusManager keeps its selector signature, resolved by the style system's selector engine, moving keyboard and accessibility focus. MediaQuery exposes viewport width and height, display scale, prefers-color-scheme, prefers-reduced-motion, prefers-contrast, pointer and hover capability, orientation, platform text scale, and safe-area and keyboard insets (read in styles as env(safe-area-inset-*) and env(keyboard-inset-height)), each a signal. FrameScheduler calls back once per display refresh with a timestamp before layout; the host renders only when dirty or a callback is pending. A new Storage Token (synchronous key-value, backed by a file in the app data directory) replaces localStorage: withStorage in the store package reads the Token instead of globalThis (a requirement on the later store port; it currently reads globalThis.localStorage, and core transition.ts reads globalThis.matchMedia, which MediaQuery replaces). New v1 native Tokens: WindowManager, Menus (app menu, context menus, shortcuts), Clipboard (text first, images later), Dialogs (open and save file, pick folder, message boxes; also back the deferred file input type), Opener (external URL, reveal file), Lifecycle (foreground, background, suspend). Notifications, share, haptics and permissions are later additions as new Tokens. Every Token is always provided with an isSupported flag; a method a platform lacks follows a documented rule (no-op or rejected promise), so components never need optional injection. Multi-window is designed in, first implementation single window: a window has a string id (main at launch); WindowManager.open(id, options) returns a handle (close, focus, size, position, closeRequested and focused signals) with options kind (normal, dialog with a parent, popup), title, size, position and modal; the root component mounts through the Renderer's resolveTarget(id); all windows share one process, JS realm, heap and UI thread. Each window gets a window injector below the app injector: app-level services (stores, HTTP, Storage) are shared, while Location, History (one router stack per window), Title, LiveAnnouncer, FocusManager, Geometry, MediaQuery and the window's overlay root are per window, so components inject them unchanged and get their own window's instance (a requirement on core: a window injector level). Multi-window works on Windows, macOS (tabbed windows and fullscreen spaces are host behaviour) and Linux; on Android, WindowManager supports no extra windows: dialog and popup kinds fall back to in-window overlays and normal windows reject with a documented message; multi-instance and external displays are out of scope for v1. The last window closing quits on Windows and Linux and keeps the app running on macOS. Renderer handle space is global; a node belongs to the window it is inserted under; inserting a node across windows is a dev-time error and a component moves by being re-created; each window has its own AccessKit tree and focus; shortcuts and menus act on the focused window and Menus can register app-wide and per-window entries; cross-window communication is shared services and signals. macOS: the host supplies the standard app menu (About, Settings with Cmd+, , Hide, Quit with Cmd+Q) and standard Edit, Window and Help menus, which the app extends or overrides through Menus; shortcuts are declared with a logical Mod key (Cmd on macOS, Ctrl elsewhere); text inputs have the platform key bindings built in (Cmd and Option with arrows, Cmd+Backspace). Android: back is a cancelable back event, then History.back, then the OS default, including predictive back on Android 13 and later; foreground and background go through Lifecycle, timers pause on background and the stack is saved.

---
<!-- COMMENTS:END -->
