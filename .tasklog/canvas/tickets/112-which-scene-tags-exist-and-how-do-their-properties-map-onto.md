---
kind: ticket
title: "Which scene tags exist and how do their properties map onto Pixi objects?"
status: resolved
type: grilling
blocked_by: [108]
tags:
  - parent-104
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-104.7 - Which-scene-tags-exist-and-how-do-their-properties-map-onto-Pixi-objects.md
assignee:
  - '@jason'
ordinal: 230000
---

## Question

With PixiJS 8 chosen and the authoring prototype in hand, decide the tag vocabulary (container, sprite, text, bitmap-text, graphics, tiling-sprite, nine-slice, mask, filter, ... and which are deferred), how each tag's properties map to Pixi properties (x/y/position, scale, rotation, anchor/pivot, alpha, tint, visible, zIndex), how shapes in `graphics` are expressed declaratively (Pixi needs clear()-and-redraw on shape change), how tags are registered (an extensible registry so apps can add their own Pixi classes), how child order and `zIndex` interact, and how non-child relationships (mask, filters) attach.

## Answer

Scene vocabulary: Pixi's own names, a tag registry, dotted property paths, shape children, and enforced typing through a per-template element map. Glossary terms "Scene tag" and "Element map".

1. **v1 tags** (kebab case of Pixi class names): `container`, `sprite`, `text`, `bitmap-text`, `graphics`, `tiling-sprite`, `nine-slice-sprite`. Deferred: `animated-sprite` (waits on assets), `html-text`, `mesh`, `particle-container`, video, Pixi `RenderLayer`. Deferred tags stay reachable through the registry and refs.
2. **Properties:** names are Pixi's own. Plain fields (`x`, `y`, `rotation`, `alpha`, `visible`, `tint`, `zIndex`, `label`) are direct writes. Point-like properties (`position`, `scale`, `pivot`, `skew`, `anchor`) accept a number (uniform) or an `{x, y}` object from a computed signal. Dotted paths address one axis: `[scale.x]`, `[pivot.y]`, `[anchor.x]`. This needs no core change: core only special-cases the `attr.`, `class.` and `style.` prefixes, and passes any other dotted name to `setProperty` whole (`template.ts` `addAttribute`). No flat `scaleX` aliases.
3. **Graphics shapes:** child tags `rect`, `rounded-rect`, `circle`, `ellipse`, `polygon` with `fill`, `stroke`, `strokeWidth`. A shape child is a lightweight node contributing to its parent's drawing; any change marks the parent dirty and one `clear()` plus redraw runs per frame. `[context]` takes a Pixi `GraphicsContext` built in code for exotic drawing and for sharing one drawing across nodes.
4. **Registry and unknown tags:** the Pixi renderer takes a tag registry (tag to constructor plus property table), extensible with `registerTag(...)`. A registered tag creates that class; an unregistered hyphenated tag is a component host and becomes a plain `container`; an unregistered unhyphenated tag (`<div>`, `<sprte>`) is a dev-time error naming the renderer. Hyphenated typos are caught by the language service.
5. **Order:** child order is draw order (`@for` reordering uses `insert`); `zIndex` is a normal property; container-like tags default `sortableChildren` to true. To verify at build: sorting only runs when order or `zIndex` is dirty, so the default has no per-frame cost.
6. **Masks and filters:** `[mask]` references another node via `#ref` (the mask node stays in the scene graph); `[filters]` takes Pixi `Filter` instances built in code. Declarative filter tags are deferred.
7. **Text:** `<text>` and `<bitmap-text>` take content from `[text]`, static `text="..."`, or element content including `{{ }}`; text content under any other tag is a dev-time error. Style properties are Pixi `TextStyle` fields written flat (`fontSize`, `fontFamily`, `fill`, `align`, `wordWrap`, `wordWrapWidth`, `letterSpacing`, `stroke`); `[style]` takes a whole style object. Flat fields, not `style.` paths, because core reserves `[style.x]` for CSS styles and stringifies the value (`String(value)`, `false` becomes null).
8. **Static attributes** are converted by the tag's property table (number, boolean, string, color), not by guessing from the string (the prototype's `Number()` guess would turn `text="123"` into a number).
9. **Language service (new requirement; today it is DOM-only):** `packages/language-service/src/emit.ts` hardcodes `HTMLElementTagNameMap`, `HTMLElement` and DOM event maps, resolves unknown names and dotted names to `any`, and does not read the `renderer` tsconfig key. A template gets its element map statically: the boundary component's own template and projected children get the Pixi map from `meta.renderer`; scene components inside it carry a type-level marker in `meta` (for example `elements: PixiElements`); a template with no marker uses the DOM map; a Pixi tag in an unmarked template is an edit-time error.
10. **Typing contract:** one TypeScript element map is the source of truth (tag to node type, property types, event map), and a conformance test checks the renderer's runtime property table (item 8) against it. These are errors by default: unknown property on a Pixi tag, wrong value type in `[prop]`, malformed static attribute (`anchor="abc"`), unknown event name, hyphenated tag that is neither registered nor a component. Dotted paths are valid only for the axes of the point-like properties (`position`, `scale`, `pivot`, `skew`, `anchor` with `.x` and `.y`), typed `number`; arbitrary deep paths are rejected and `[style.*]` is flagged on Pixi tags.

Build tickets that follow from this: the Pixi renderer with tag registry and property table; the Pixi element map and language-service support for per-template element maps (including events, which canvas/113 decides).

---
<!-- COMMENTS:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T17:29:00Z

---
