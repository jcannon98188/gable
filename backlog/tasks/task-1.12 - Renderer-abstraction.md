---
id: TASK-1.12
title: Renderer abstraction
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 06:25'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.4
  - TASK-1.5
parent_task_id: TASK-1
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

The DOM renderer must be one renderer among several, opening the way for a future gable.native. Where is the renderer seam: what does the core (components, DI, signals, parsed templates) hand to a renderer, what does a renderer implement (create/update/insert/remove nodes, events, styles), and how does that seam affect template syntax, HMR and the router? Only the seam is in v0; a native renderer is not.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:34
---
From Component model and hierarchical DI: bootstrap(Root, { renderer, providers }) takes the renderer as an argument; hosts are renderer-provided (createComponent({ host })); style scoping and host bindings are renderer-owned; HMR needs a renderer operation to re-run a view against the same instance.
---

created: 2026-11-05 04:46
---
From Template syntax: the renderer supplies @defer triggers beyond when/idle/timer (DOM: viewport, interaction, hover) and any template node/namespace handling.
---

created: 2026-11-05 05:06
---
Resolved with the user.

**Seam level**: low-level node operations. The core owns the parsed template, expression interpreter, bindings (each a core effect), control flow, `@defer`, slot projection and scheduling; the renderer is a small set of operations over opaque node handles. Create: `createElement(tag, parent)`, `createText`, `createAnchor`. Update: `setProperty`, `setAttribute`, `setClass`, `setStyle`, `setText`. Tree: `insert(parent, node, before?)`, `remove`. Events: `listen(node, name, handler) -> unsubscribe`. All synchronous.
**Platform services**: the renderer is nodes only. Location, history and similar are core-defined DI Tokens implemented by the platform package, which ships one entry (e.g. `dom()`) wiring renderer plus platform providers. The router depends only on the abstract Tokens.
**Test renderer**: v0 ships an in-memory renderer (inspectable node tree, no DOM/jsdom) as the second implementation, keeping the seam honest and used for component unit tests. gable.native stays out of scope.
**Tags/properties**: the core knows nothing about tags or properties. `[x]` = `setProperty`, `[attr.x]` = `setAttribute`, `[class.x]`/`[style.x]` have own ops; meaning is the renderer's. The renderer throws clear dev-time errors for unknown tags/properties and ships a TypeScript element/property map (DOM derives from `lib.dom`) that the template language service reads.
**Namespaces**: `createElement(tag, parent)` lets the renderer pick SVG/MathML context (and switch back, e.g. `foreignObject`); native ignores it. Text/comment nodes need none.
**Events**: renderer decides what `$event` is. No event modifiers in v0 (handlers call `preventDefault` themselves); modifiers can be added later without changing the seam.
**Static fast path**: not in v0. An optional `createStatic` (e.g. `<template>.cloneNode`) can be added later without breaking renderers; perf is still in the fog.
**HMR**: no special view operation. The core disposes the view scope, removes its nodes and re-instantiates the new template into the same anchor with the same instance, using only `remove`/`insert`. Styles: `registerStyles(componentId, css)` returns the scoping token stamped on elements; re-registering the same id replaces the CSS in place. Preserving DOM-level state (focus, scroll, input text) across a template swap is left to the HMR runtime ticket; v0 assumes the template DOM is rebuilt. This replaces the earlier assumption that HMR needs a renderer operation.
**Hosts/bootstrap**: the core parses the component `selector` and builds the host through ordinary ops (`createElement` plus `setAttribute`/`setClass`); `meta.host` bindings/listeners use the same ops. `bootstrap(Root, { renderer: dom(), target: '#app' })`: `target` is opaque to the core, resolved by the renderer; an existing element is adopted as the host.
**`@defer` triggers**: parser accepts any `on <name>(args)`. Core handles `when`, `idle`, `timer`; everything else goes to the renderer via `observeTrigger(name, args, placeholderNode | undefined, fire) -> dispose` (DOM: `viewport`, `interaction`, `hover`). Unknown trigger = dev-time error naming the renderer; the renderer package also declares its trigger list for the language service.
---

created: 2026-11-05 05:28
---
From HMR runtime: two optional renderer operations for DOM-state preservation, captureViewState(rootNodes) -> token and restoreViewState(newRootNodes, token). Called by the core around a view rebuild; the DOM renderer saves focus, selection, scroll and form-control values matched by structural path; test and native renderers may omit them. HMR now rebuilds against a new instance (state transferred), still via only remove/insert.
---

created: 2026-11-05 06:25
---
Amendment from Forms: Forms needs the renderer to ship a [field] control directive (value mapping by element type, write-back, touched on blur, disabled and aria-invalid), so each renderer defines its own form bindings. The test renderer needs an equivalent so forms are unit-testable.
---
<!-- COMMENTS:END -->
