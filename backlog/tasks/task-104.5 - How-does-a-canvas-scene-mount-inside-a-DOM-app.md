---
id: TASK-104.5
title: How does a canvas scene mount inside a DOM app?
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T05:42:00Z'
updated_date: '2026-11-12T16:52:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-104.2
parent_task_id: TASK-104
ordinal: 228000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Decide the hosting model using the renderer-seam research: a <gable-canvas>-style host component in a DOM app whose subtree renders through the canvas renderer (versus a whole-app canvas renderer), how the second renderer is scoped through the injector, how DOM content and scene content communicate (signals shared through DI, events out), what core changes (if any) are accepted, and how HMR and teardown behave for the subtree.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T16:52:00Z

---

## Resolution

Hosting model: a DOM-hosted subtree, built through a **renderer boundary** declared on a component. Recorded in ADR 0019 (docs/adr/0019-a-component-can-build-its-template-with-a-different-renderer.md); glossary term "Renderer boundary".

1. **Hosting:** a normal DOM Gable app embeds a `<gable-canvas>`-style host component; only its subtree renders through the Pixi renderer. A whole-app canvas renderer is out of scope.
2. **Boundary:** the component declares it in static `meta` (a renderer factory called once per instance after setup). Its host node stays in the parent's renderer; its template and projected `<slot>` content are built with the boundary's renderer. Inline children (`<gable-canvas><sprite [x]="x()"></sprite></gable-canvas>`) are allowed and evaluate in the declaring DOM component's scope: `buildSlot` already uses the renderer at the slot site, so no slot change is needed. Scene components (`<game-ship>`) are ordinary components inside the boundary.
3. **Scope and injector:** the scene is built inside the host's view, so it shares the host's scope (lifetime) and injector. The boundary layers the Pixi renderer's `providers` as a child injector and shadows `RENDERER` there. This removes the prototype's imperative `createComponent`, hand-wired scope and injector hacks.
4. **Core changes accepted:** the boundary mechanism and an optional `Renderer.destroy?()`. Rejected: per-subtree renderer syntax, a frame/flush hook on the Renderer (TASK-104.6), window-level injectors, cross-renderer projection beyond `<slot>`.
5. **DOM <-> scene:** DI-shared services holding signals is the one channel. No event bridge. Forwarding the host's inputs/outputs into the scene is an API-design detail.
6. **Size:** the host fills its DOM box (CSS decides). The boundary provides an injected service with canvas size and pixel ratio as signals; Pixi `resizeTo` handles the buffer. Exact shape is API design.
7. **Teardown and HMR:** host destroyed -> scope disposes -> `renderer.destroy()` releases the Application and GL context. Editing a scene component rebuilds only that subtree with the live renderer (HMR already tracks the renderer per component); editing the host recreates the Application. Service state survives as for DOM components.
8. **Crossing renderers:** using a scene tag in DOM, or a DOM tag in a scene, fails through the target renderer's own dev-time unknown-tag error. No "scene-only component" declaration.

Open detail for later tickets: Pixi `Application.init` is async while Renderer ops are synchronous (display objects can be built before init and attached after); multiple canvas hosts per page get one Application each, unoptimised.

---
<!-- COMMENTS:END -->
