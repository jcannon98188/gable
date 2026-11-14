---
id: TASK-99.8
title: Styling model
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T21:37:00Z'
updated_date: '2026-11-07T22:22:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-99.5
  - TASK-99.6
  - TASK-99.14
parent_task_id: TASK-99
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How are Gable Native components styled: a CSS subset, Tailwind v4 compatibility, scoped styles per component, design tokens and theming, dark mode, units and density? Decide what is supported, what is not, how it maps to the chosen layout engine, and how gable-ui styles could eventually run on both renderers.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T22:22:00Z

---

Resolved with the user. Style language: CSS, the same sources as the web (meta.styles strings and Tailwind v4 output), interpreted as a defined subset; anything outside it is a dev-time diagnostic naming the property or selector and the renderer, never silent breakage. Layout: display block, flex, grid and none via Taffy; box model; position relative, absolute, fixed and sticky (sticky for scroll containers); overflow with scrolling and clipping; gap; aspect-ratio; z-index stacking; inline text runs (span, strong, em, a) as styled runs in a block; inline-flex treated as flex, inline-block as a block-level box with a diagnostic. Tables are supported: the tags table, thead, tbody, tfoot, tr, th, td, caption and colgroup and display: table* values are lowered onto Taffy grid (columns size to content across rows, colspan and rowspan become grid spans, table-layout: fixed uses fixed tracks, border-collapse is drawn by the painter), with deviations documented in the spec and a dedicated table algorithm as a possible later upgrade. Not supported: floats, multi-column, writing-mode. Selectors: type, class, id, attribute, descendant, child and sibling combinators, :is, :where, :not, :first-child, :last-child, :nth-child, :hover, :focus, :focus-visible, :active, :disabled, :checked, ::placeholder and ::selection, with :has as a stretch goal. ::before and ::after are in: style-system-generated boxes with no Renderer handles, so the seam is unchanged; they take part in layout and painting; content supports strings, attr() and none (empty string for decorative boxes); counters and url() later; generated content reaches accessibility only when non-empty. At-rules: @layer, @media (including range syntax), @container with container-type, @supports, @keyframes, @font-face, @property, @starting-style; custom properties inherit and var() works. Values: px, rem, em, %, vw, vh, dvh, ch, calc, min, max, clamp; hex, rgb, hsl, oklch, oklab and color-mix; px is density-independent and rem follows the platform text scale. Properties: individual translate, scale and rotate, 2D transform, transition-behavior: allow-discrete. Filters, backdrop-filter and 3D transforms are in: filter functions (blur, drop-shadow, brightness, contrast, grayscale, saturate, hue-rotate, sepia, invert, opacity) in the first version via isolated offscreen layers with damage rectangles grown by the filter extent and a decided blur limit or fallback for low-end Android GPUs; backdrop-filter limited to blur() and the colour functions, which needs an order-sensitive stacking-context model with isolated groups in the display-list boundary; 3D transforms in two tiers, the first version supporting perspective(), rotateX, rotateY and translateZ on a single element with correct pointer hit-testing (ray-plane intersection, so pointer-event x and y stay correct) and a defined accessibility bounds rule, and a later tier for transform-style: preserve-3d scenes, backface-visibility and perspective-origin, with flattening plus a dev-time diagnostic until then. OS translucency (Windows backdrop materials, macOS vibrancy) is separate and out of this property. Scoped styles: unchanged core; registerStyles returns a scoping token that the core stamps with setAttribute, and the host compiles scoped selectors to the same attribute selectors the DOM renderer produces. Theming: the MediaQuery Token drives prefers-color-scheme so dark: works in media and class forms; design tokens are plain CSS custom properties (Tailwind @theme is resolved at build time); generic font families map to platform fonts through Fontique and @font-face loads from the bundle; scrollbars, caret, selection handles and the focus ring default to the platform look with limited overrides (scrollbar-width, scrollbar-color, accent-color, caret-color, cursor on desktop only, ::selection). Excluded from the first version: content-visibility is accepted but ignored. CSS stack: adopt Stylo as the style system behind a style-system boundary, as Blitz does: the host implements Stylo element and document traits over the retained node tree and converts computed styles for Taffy (stylo_taffy); the prototype must measure binary size and build time and verify the Python 3 build dependency, the MPL-2.0 file-level copyleft implications, @layer, @property, :has and @starting-style behaviour as consumed, and the macOS and Android builds with macOS on CI; the fallback is cssparser plus selectors plus our own cascade. The display-list boundary must carry isolated layers, backdrop reads, and 4x4 matrices with perspective from the start so these are not retrofitted.

---
<!-- COMMENTS:END -->
