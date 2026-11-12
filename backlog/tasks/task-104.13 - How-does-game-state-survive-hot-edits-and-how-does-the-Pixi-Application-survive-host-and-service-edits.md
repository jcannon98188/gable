---
id: TASK-104.13
title: >-
  How does game state survive hot edits, and how does the Pixi Application
  survive host and service edits?
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:37:00Z'
updated_date: '2026-11-12T21:41:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-104.12
parent_task_id: TASK-104
ordinal: 236000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Decide how game state survives hot edits, using the measured behaviour of the spike on branch `prototype/pixi-renderer-spike` (`docs/research/pixi-renderer-spike.md`, "HMR" section).

Measured: through the real Vite and Gable HMR path there was no full reload, no leaked display objects or textures in 12 snapshots, no double-registered frame hooks, and the loop kept running after every edit. Template and service-method edits keep the Pixi Application, the GL context and all entities. Class edits rebuild the affected component (a rock's class edit rebuilds every live rock). Editing the `<gable-canvas>` host's class, or adding a field to the root `GameState` service, recreates the canvas element, the Application and the GL context on every edit, because the host keeps its Application in `#private` fields that state transfer cannot see. Service state (`elapsed`, `hits`, the rocks list) carried across every re-setup, including when the service instance was replaced.

Decide: (1) how the Application and renderer survive host edits and root-service edits (a transferable handle, an explicit hot-data hook, or accept recreation); (2) where timers, accumulators and entity lists are meant to live (in services versus component fields) and what the framework documents or enforces; (3) what a class edit to an entity component does to a live swarm (rebuild all, rebuild lazily, keep instances with patched methods) and whether a game wants to opt out; (4) whether a root-service field edit may cascade into rebuilding the whole scene; (5) how `onFrame` hooks and `onFixedStep` accumulators behave across rebuilds; (6) what remains unmeasured before this can be trusted: long-run heap growth over many edits, a real `setInterval` in a component field versus a service, whether a `spawnTimer`-style field is transferred (inconclusive in the spike).
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T21:41:00Z

---

## Resolution

HMR for game state: the Pixi Application survives through a new core hot-data primitive, durable game state lives in services, entity and provider edits rebuild the scene content but never the GL context, and a release-gate test plan closes the unmeasured gaps.

1. **Application survival:** core gains one additive, dev-only primitive, `hotData(key, create)`, callable in a field initialiser. It returns the value stored for this component's identity (tree path plus key) and calls `create` only the first time; in production it just calls `create`. `<gable-canvas>` keeps its Application and renderer there instead of in `#private` fields, so a host class edit re-runs setup and gets the same Application back. Because it is fetched during setup, no throwaway second Application is built (state transfer runs after setup and cannot hand one over). This is a fifth additive core change, joining the four in the package-layout ticket, and it also serves any other non-copyable resource a component owns.
2. **Provider edits:** adding a field to a root service rebuilds the scene content below it (the provider really changed) but not the Application or GL context, because the host asks `hotData` for it. No partial subtree retention mechanism.
3. **Where state lives:** durable game state (clock, score, entity list and physics data) lives in services, or in signals on services; component fields hold view-local, derivable state. Entities are plain data in a service list; entity components render and own only transient view state. Timers use `Frame` hooks and fixed-step accumulators held in the service. The dev build warns when a component registers a raw `setInterval` or `setTimeout` without `onCleanup`. Documented as the canvas package's pattern.
4. **Entity class edits:** editing a rock's class rebuilds all live rocks (per-instance hot swap); accepted, since state that matters is entity data in the service (item 3). No keep-instances patch mode. Method-only edits use the existing `patch` path when the class has no `#private` members; documented: avoid `#private` in hot-edited classes.
5. **Frame hooks and accumulators:** hooks registered with `inject(Frame).onFrame(...)` are tied to the component scope via `onCleanup`, so a rebuild unregisters the old hook and registers the new one. Fixed-step accumulators live in the `Frame` service per boundary, so rebuilds never reset time debt; `onFixedStep` callbacks re-register while the accumulator persists. A rebuild mid-frame takes effect at the next frame, never inside one.
6. **Release-gate verification:** a soak script and tests in the renderer package's HMR suite for: heap and Pixi resource growth over at least 200 edits with forced GC; a real `setInterval` in a component field versus a service; whether a non-cyclic `spawnTimer`-style field is transferred (explicit unit test); HMR with a `useValue` service; and direct `applyUpdate`.

Facts relied on (spike, branch `prototype/pixi-renderer-spike`, `docs/research/pixi-renderer-spike.md`): through the real Vite path there was no reload, no leaked display objects or textures in 12 snapshots, no duplicate hooks and a steady ~60 ticks per second after every edit; host class edits and root-service field edits recreated the canvas, Application and GL context every time; service state, including `elapsed`, carried across every re-setup; `transferState` (`packages/core/src/hmr-transfer.ts`) copies only public fields whose name and kind match and runs after setup.

---
<!-- COMMENTS:END -->
