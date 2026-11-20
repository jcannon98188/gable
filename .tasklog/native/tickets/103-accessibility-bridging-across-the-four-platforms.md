---
kind: ticket
title: Accessibility bridging across the four platforms
status: resolved
type: research
tags:
  - parent-99
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-99.4 - Accessibility-bridging-across-the-four-platforms.md
assignee:
  - '@jason'
ordinal: 190000
---

## Question

How can an own-drawn UI expose an accessibility tree on Windows (UIA), macOS (NSAccessibility), Linux (AT-SPI) and Android (AccessibilityNodeInfo)? Assess AccessKit and any alternatives: coverage per platform, maturity, what the framework must supply (roles, names, focus, live regions), and how Gable LiveAnnouncer and FocusManager would map. Facts and a comparison, not a decision.

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T21:41:00Z

---

Research resolved. Findings on branch `research/native-accessibility` (research/native-accessibility.md). All four platforms need the app to publish its own tree of virtual elements (UIA providers, NSAccessibilityElement, AT-SPI over D-Bus, AccessibilityNodeProvider). AccessKit has released adapters for Windows, macOS, Linux and Android at rough feature parity, but is pre-1.0 with breaking releases, no rich text, and its Android adapter needs a Java delegate and works with winit only through GameActivity. The framework supplies a node tree (ids, roles, names, bounds, actions, focus) and handles action requests and per-platform threading. Live regions are weak: AccessKit has only live Off/Polite/Assertive with no announce-this-string call, macOS VoiceOver may drop medium-priority announcements (open issue), Linux unconfirmed. Gable mapping: LiveAnnouncer becomes a live node whose label changes; FocusManager.focus(selector) has no direct native counterpart. Alternatives: writing the four adapters directly (gives direct announcement APIs), or Flutter/Qt stacks that cannot be reused as a library. Unverified: Apple NSAccessibility pages, Android announceForAccessibility deprecation, Qt backends, Flutter mapping; no screen reader tested.

---
<!-- COMMENTS:END -->
