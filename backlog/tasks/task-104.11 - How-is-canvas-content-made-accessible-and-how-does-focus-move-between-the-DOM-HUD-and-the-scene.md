---
id: TASK-104.11
title: >-
  How is canvas content made accessible and how does focus move between the DOM
  HUD and the scene?
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T17:35:00Z'
updated_date: '2026-11-12T18:26:00Z'
labels:
  - wayfinder:grilling
dependencies: []
parent_task_id: TASK-104
ordinal: 234000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

With the hosting model (a DOM-hosted renderer boundary), the Pixi element map and the input model (pointer events, `Pointer`/`Keyboard`/`Gamepad` services, focus-scoped keyboard) decided, decide how canvas content is made accessible and how focus and assistive technology move between the DOM HUD and the scene: what is exposed to assistive tech (ARIA on the host, Pixi's accessibility plugin, a semantic DOM mirror of interactive scene nodes), how scene nodes become focusable or announceable, how keyboard navigation moves between DOM controls and the canvas without trapping, how live announcements (score changes, game over) use the existing Platform services (LiveAnnouncer, FocusManager), what the minimum accessible game surface is for v1, and what a game author must do themselves.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T18:26:00Z

---

## Resolution

Accessibility: the DOM host carries the labelling, an opt-in Gable-owned semantic mirror exposes interactive scene nodes, focus follows plain DOM rules with no trap, and announcements reuse the existing `LiveAnnouncer`.

1. **Exposure:** the canvas is not exposed as content. The `<gable-canvas>` host gets `role="group"` (overridable), takes `aria-label` / `aria-labelledby` from host attributes, and is `aria-hidden` only when the author marks the scene decorative. `role="application"` is opt-in only (it suppresses screen-reader browse mode). There is no automatic accessibility tree guessed from sprites; what a user must perceive or operate comes from the DOM HUD, live announcements, or the mirror.
2. **Semantic mirror:** scene tags accept an opt-in `[a11y]` property `{ role, label, description?, focusable?, order? }`. The canvas package keeps a visually hidden DOM subtree beside the canvas with one real element per tagged node (`button`, `img`, `listitem`, ...), positioned from the node's bounds and ordered by scene order unless `order` overrides. Activating a mirror element (click, Enter, Space) dispatches the node's own pointer-tap handler. Untagged nodes have no mirror. Pixi's built-in accessibility plugin is not used: it has its own lifecycle outside Gable's signals and nothing declarative.
3. **Focus:** the host is one tab stop (TASK-104.8). When mirror elements exist they become the tab stops instead, in order. No focus trap: Tab and Shift+Tab always leave, Escape is never captured. Arrow-key navigation inside the scene is the author's job via `Keyboard`. The focus ring is DOM (an outline on the positioned mirror element or host), so forced-colours and system settings apply. Scene code uses the injected `FocusManager` for programmatic focus (for example, focus Resume when a pause menu opens).
4. **Announcements:** game events go through the injected `LiveAnnouncer` (`polite` or `assertive`), the same path the router uses; the canvas package adds no second announcer. A helper `announceOnChange(signal, format)` wires a signal to it, throttled (default at most one polite message per second) so per-frame signals do not flood a screen reader.
5. **v1 contract:** the framework provides a labelled host, non-trapping focus, the opt-in mirror, announcer access, and a `ReducedMotion` signal service (it has no motion of its own to respect). The author must label the host, mark interactive nodes with `[a11y]`, announce meaningful state changes, give every pointer action a non-pointer route, keep HUD in DOM, and not rely on colour alone. This is documented as a checklist. No automated game accessibility audit in v1; a lint that flags pointer-listening nodes without `[a11y]` is a possible follow-up.
6. **Testing (TASK-104.10 model):** the mirror is recorded data in the scene test renderer: `fixture.scene.a11y()` returns elements (`role`, `label`, bounds, order); `fixture.scene.focus(node)` and `tab()` simulate focus movement; `fixture.announcer.messages` records announcements. The real-browser smoke suite adds one axe-core check on a host with a mirror.

Facts relied on: core already defines `LiveAnnouncer` (polite and assertive regions) and `FocusManager` in `packages/core/src/platform.ts`, with DOM implementations in `packages/renderer-dom/src/platform.ts`; the router uses both. TASK-104.8 made the host focusable and focus-scoped for the `Keyboard` service.

---
<!-- COMMENTS:END -->
