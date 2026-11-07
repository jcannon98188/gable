---
id: TASK-99.14
title: Rust CSS style engines and Tailwind v4 feature inventory
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T22:10:00Z'
updated_date: '2026-11-07T22:16:00Z'
labels:
  - wayfinder:research
dependencies: []
parent_task_id: TASK-99
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Gable Native will interpret component styles (the CSS in meta.styles, and Tailwind v4 output) in a Rust host built on Skia, Taffy, Parley and AccessKit. What does Rust offer for CSS parsing, selector matching and cascade and computed-value resolution (Stylo, lightningcss, cssparser plus selectors, simplecss, others), how does Blitz combine them with Taffy, Parley and Vello, what are the licences, binary-size and build-time costs, and the Android and macOS build story? Which CSS features does Tailwind v4 output (and gable-ui's own CSS) actually rely on: @layer, @property, custom properties, oklch and color-mix, :where and :is, :has, attribute and state selectors, container queries, @supports, animations and transitions? How much of that does Taffy's style model cover? Facts and comparison only, no decision.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T22:16:00Z

---

Research resolved. Findings on branch `research/rust-css-style-engines` (research/rust-css-style-engines.md). Stylo 0.23.0 is the only browser-grade engine (parsing, selector matching, cascade, computed values, animations); MPL-2.0, needs Python 3 at build time. selectors 0.42 and cssparser 0.38 (both MPL-2.0) give matching and tokenizing only. lightningcss 1.0.0-alpha.72 (MPL-2.0) is a parser and transformer with no documented selector matching or cascade. simplecss is CSS 2 only. Blitz 0.3.0-beta.4 (MIT or Apache-2.0) combines Stylo, stylo_taffy, Taffy, Parley and AnyRender (Vello, Vello CPU, Vello Hybrid and Skia backends); desktop and Android browser builds exist, container queries are stubbed, and transitions, animations and 2D transforms are supported. Tailwind 4.3.5 output (ui-gallery, 46 KB minified) uses 5 @layer blocks, 41 @property rules, 30 @supports rules, 56 color-mix and 38 oklch uses, about 490 var() and 128 calc(), :is(:where(.group):hover *), :where, :not, :has(>svg), attribute selectors, range-syntax @media, 5 @keyframes, individual translate/scale/rotate properties, and transitions on display and content-visibility; one container declaration and no @container rules in that build; @theme, @apply and @utility are resolved at build time. Taffy covers block, flex, grid, position, inset, overflow, sizing, gap and calc, but has no inline or list-item display, no sticky positioning, and no cascade, selectors, custom properties or paint. Gaps: no binary size or build time for Stylo or Blitz; Stylo @layer, @property, :has and @starting-style behaviour as Blitz consumes them is unverified; no Stylo-specific Android or macOS build documentation; the CSS counts come from one build.

---
<!-- COMMENTS:END -->
