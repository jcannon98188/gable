---
kind: ticket
title: "@gable/store: withEntities and signalStoreFeature"
status: resolved
blocked_by: [31]
tags:
  - store
  - ready-for-agent
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-33 - gable-store-withEntities-and-signalStoreFeature.md
assignee:
  - '@claude'
ordinal: 74000
---

## Question

Entity collection feature (ids, entityMap, entities, add/set/update/remove/upsert updaters with selectId and collection options) plus signalStoreFeature for reusable custom features. Include type tests.

## Acceptance criteria

- [x] #1 withEntities and its updaters work with custom selectId and named collections
- [x] #2 signalStoreFeature builds reusable features with typed input requirements
- [x] #3 Tests and docs added

## Implementation plan

1. signal-store-feature.ts (signalStoreFeature, type helper). 2. entities.ts (withEntities, updaters). 3. Export from index.ts. 4. Runtime + type tests. 5. docs/store.md. 6. vitest + tsc.

## Implementation notes

Added packages/store/src/entities.ts, signal-store-feature.ts, entities.test.ts; exported from index.ts; docs in docs/store.md. Notes: update-style updaters (updateEntity etc.) infer the entity type from patchState's return context for the default collection; named collections need entityConfig({entity: type<T>(), collection}) because TS cannot infer through template-literal keys. Input-carrying signalStoreFeature returns a generic function so inline withState before it keeps its type (existing signalStore overloads lose the type otherwise; core store.ts untouched). Verified: vitest packages/store 47 passed, tsc -p packages/store clean.

## Answer

withEntities (default and named collections), 14 updaters with selectId/collection config, entityConfig helper, type<T>() token and signalStoreFeature (1-5 features, optional typed input requirements) added to @gable/store with runtime and expectTypeOf tests and docs. vitest and tsc pass. Limitation: update* updaters on named collections need entityConfig for typing.
