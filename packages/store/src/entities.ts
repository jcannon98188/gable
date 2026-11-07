import { withComputed, withState, type DeepSignal, type StoreFeature } from "./store.js";

// --- types -----------------------------------------------------------------

export type EntityId = string | number;
export type EntityMap<E> = Record<EntityId, E>;

/** State added by `withEntities` for the default (unnamed) collection. */
export interface EntityState<E> {
  ids: EntityId[];
  entityMap: EntityMap<E>;
}

/** State added for the collection `C`: `${C}Ids` and `${C}EntityMap`. */
export type NamedEntityState<E, C extends string> = {
  [K in `${C}Ids`]: EntityId[];
} & {
  [K in `${C}EntityMap`]: EntityMap<E>;
};

export type NamedEntityProps<E, C extends string> = {
  [K in `${C}Entities`]: DeepSignal<E[]>;
};

export type EntityStateOf<E, C extends string | undefined> = [C] extends [string] ? NamedEntityState<E, C> : EntityState<E>;

export type SelectEntityId<E> = (entity: E) => EntityId;

/** Options shared by every updater: which collection it targets and how to read an entity's id. */
export interface EntityConfig<E, C extends string | undefined> {
  /** A type token (`type<Todo>()`). Lets updaters that do not take a whole entity (`updateEntity`, ...) know the entity type; see `entityConfig`. */
  entity?: E;
  collection?: C;
  selectId?: SelectEntityId<E>;
}

type HasId<E> = E extends { id: EntityId } ? true : false;

// Entities with an `id: string | number` need no selectId; any other shape must supply one.
type ConfigArgs<E, C extends string | undefined> = HasId<E> extends true
  ? [config?: EntityConfig<E, C>]
  : [config: EntityConfig<E, C> & { selectId: SelectEntityId<E> }];

/** What an updater returns: pass it to `patchState`. */
export type EntityUpdater<E, C extends string | undefined> = (state: EntityStateOf<E, C>) => Partial<EntityStateOf<E, C>>;

export type EntityChanges<E> = Partial<E> | ((entity: E) => Partial<E>);

type Predicate<E> = (entity: E) => boolean;

type Cfg = { collection?: string; selectId?: (entity: never) => EntityId };

// --- withEntities ----------------------------------------------------------

type NoShape = { state: {}; props: {}; methods: {} };
type DefaultShape<E> = { state: EntityState<E>; props: { entities: DeepSignal<E[]> }; methods: {} };
type NamedShape<E, C extends string> = { state: NamedEntityState<E, C>; props: NamedEntityProps<E, C>; methods: {} };

/**
 * Adds an entity collection: `ids`, `entityMap` (state) and `entities` (computed, in `ids` order).
 * Name the collection to get `${name}Ids`, `${name}EntityMap` and `${name}Entities`, and to hold several collections in one store.
 * Change it with `patchState(store, addEntity(...))` and the other updaters; pass the same `collection` to each.
 *
 * `withEntities<Todo>()`, or `withEntities({ entity: type<Todo>(), collection: 'todo' })`.
 */
export function withEntities<E>(): StoreFeature<NoShape, DefaultShape<E>>;
export function withEntities<E>(config: { entity: E }): StoreFeature<NoShape, DefaultShape<E>>;
export function withEntities<E, C extends string>(config: { entity: E; collection: C }): StoreFeature<NoShape, NamedShape<E, C>>;
export function withEntities(config?: { entity?: unknown; collection?: string }): unknown {
  const k = keys(config?.collection);
  return (store: object) => {
    const apply = (f: unknown) => (f as (s: object) => object)(store);
    apply(withState({ [k.ids]: [], [k.map]: {} }));
    apply(
      withComputed((s: Record<string, () => unknown>) => ({
        [k.entities]: () => {
          const map = s[k.map]!() as Record<EntityId, unknown>;
          return (s[k.ids]!() as EntityId[]).map((id) => map[id]);
        },
      })),
    );
    return store;
  };
}

/**
 * Builds a reusable config for the updaters. Because it carries the entity type, `updateEntity` and friends are fully typed with it:
 * `const todo = entityConfig({ entity: type<Todo>(), collection: "todo" })`, then `updateEntity({ id, changes }, todo)`.
 */
export function entityConfig<E, C extends string | undefined = undefined>(config: { entity: E; collection?: C; selectId?: SelectEntityId<NoInfer<E>> }): EntityConfig<E, C> & { selectId: SelectEntityId<E> } {
  return config as never;
}

// --- updaters --------------------------------------------------------------

function keys(collection?: string) {
  return collection === undefined
    ? { ids: "ids", map: "entityMap", entities: "entities" }
    : { ids: `${collection}Ids`, map: `${collection}EntityMap`, entities: `${collection}Entities` };
}

function idOf(entity: unknown, config?: Cfg): EntityId {
  const id = config?.selectId ? config.selectId(entity as never) : (entity as { id?: EntityId }).id;
  if (id === undefined) throw new Error("@gable/store: entity has no id. Give it an `id` or pass `selectId`.");
  return id;
}

type Raw = { ids: EntityId[]; map: Record<EntityId, unknown> };

// Returns `never` so each public signature can declare its own precise updater type.
function build(config: Cfg | undefined, recipe: (raw: Raw) => Raw | undefined): never {
  const k = keys(config?.collection);
  return ((state: Record<string, unknown>) => {
    const next = recipe({ ids: state[k.ids] as EntityId[], map: state[k.map] as Record<EntityId, unknown> });
    return next ? { [k.ids]: next.ids, [k.map]: next.map } : {};
  }) as never;
}

const has = (map: object, id: EntityId) => Object.prototype.hasOwnProperty.call(map, id);

function addMany(raw: Raw, entities: readonly unknown[], config: Cfg | undefined, onExisting?: (old: unknown, entity: unknown) => unknown): Raw | undefined {
  let ids = raw.ids;
  let map = raw.map;
  let changed = false;
  for (const entity of entities) {
    const id = idOf(entity, config);
    if (has(map, id)) {
      if (!onExisting) continue;
      map = { ...map, [id]: onExisting(map[id], entity) };
    } else {
      if (ids === raw.ids) ids = [...ids];
      ids.push(id);
      map = { ...map, [id]: entity };
    }
    changed = true;
  }
  return changed ? { ids, map } : undefined;
}

/** Adds an entity; ignored when one with that id already exists. */
export function addEntity<E, C extends string | undefined = undefined>(entity: E, ...[config]: ConfigArgs<E, C>): EntityUpdater<E, C> {
  return addEntities([entity], config as never);
}

/** Adds entities, skipping ids that already exist. */
export function addEntities<E, C extends string | undefined = undefined>(entities: readonly E[], ...[config]: ConfigArgs<E, C>): EntityUpdater<E, C> {
  return build(config, (raw) => addMany(raw, entities, config));
}

/** Adds an entity, or replaces the existing one with the same id. */
export function setEntity<E, C extends string | undefined = undefined>(entity: E, ...[config]: ConfigArgs<E, C>): EntityUpdater<E, C> {
  return setEntities([entity], config as never);
}

/** Adds entities, replacing existing ones with the same id. */
export function setEntities<E, C extends string | undefined = undefined>(entities: readonly E[], ...[config]: ConfigArgs<E, C>): EntityUpdater<E, C> {
  return build(config, (raw) => addMany(raw, entities, config, (_old, entity) => entity));
}

/** Replaces the whole collection. */
export function setAllEntities<E, C extends string | undefined = undefined>(entities: readonly E[], ...[config]: ConfigArgs<E, C>): EntityUpdater<E, C> {
  return build(config, () => addMany({ ids: [], map: {} }, entities, config, (_old, entity) => entity) ?? { ids: [], map: {} });
}

/** Adds an entity, or shallow-merges it into the existing one with the same id. */
export function upsertEntity<E, C extends string | undefined = undefined>(entity: E, ...[config]: ConfigArgs<E, C>): EntityUpdater<E, C> {
  return upsertEntities([entity], config as never);
}

/** Adds entities, or shallow-merges each into the existing one with the same id. */
export function upsertEntities<E, C extends string | undefined = undefined>(entities: readonly E[], ...[config]: ConfigArgs<E, C>): EntityUpdater<E, C> {
  return build(config, (raw) => addMany(raw, entities, config, (old, entity) => ({ ...(old as object), ...(entity as object) })));
}

function updateMany(raw: Raw, targets: readonly EntityId[], changes: EntityChanges<never>, config: Cfg | undefined): Raw | undefined {
  let ids = raw.ids;
  let map = raw.map;
  let changed = false;
  for (const id of targets) {
    if (!has(map, id)) continue;
    const old = map[id];
    const patch = typeof changes === "function" ? (changes as unknown as (e: unknown) => object)(old) : changes;
    const updated = { ...(old as object), ...patch };
    const newId = idOf(updated, config);
    if (String(newId) === String(id)) {
      map = { ...map, [id]: updated };
    } else {
      const { [id]: _drop, ...rest } = map;
      map = { ...rest, [newId]: updated };
      if (ids === raw.ids) ids = [...ids];
      ids[ids.findIndex((x) => String(x) === String(id))] = newId;
    }
    changed = true;
  }
  return changed ? { ids, map } : undefined;
}

/** Shallow-merges changes into the entity with this id. Missing ids are ignored. If the changes alter the id, the entity keeps its position under the new id. */
export function updateEntity<E, C extends string | undefined = undefined>(update: { id: EntityId; changes: EntityChanges<NoInfer<E>> }, ...[config]: ConfigArgs<E, C>): EntityUpdater<E, C> {
  return build(config, (raw) => updateMany(raw, [update.id], update.changes as never, config));
}

/** Applies the same changes to every entity in `ids`, or matching `predicate`. */
export function updateEntities<E, C extends string | undefined = undefined>(update: { ids: readonly EntityId[]; changes: EntityChanges<NoInfer<E>> }, ...config: ConfigArgs<E, C>): EntityUpdater<E, C>;
export function updateEntities<E, C extends string | undefined = undefined>(update: { predicate: Predicate<NoInfer<E>>; changes: EntityChanges<NoInfer<E>> }, ...config: ConfigArgs<E, C>): EntityUpdater<E, C>;
export function updateEntities(
  update: { ids?: readonly EntityId[]; predicate?: (entity: never) => boolean; changes: any },
  ...args: any[]
): any {
  const config = args[0] as Cfg | undefined;
  return build(config, (raw) => {
    const targets = update.ids ?? raw.ids.filter((id) => update.predicate!(raw.map[id] as never));
    return updateMany(raw, targets, update.changes, config);
  });
}

/** Applies changes to every entity in the collection. */
export function updateAllEntities<E, C extends string | undefined = undefined>(changes: EntityChanges<NoInfer<E>>, ...[config]: ConfigArgs<E, C>): EntityUpdater<E, C> {
  return build(config, (raw) => updateMany(raw, raw.ids, changes as never, config));
}

function removeMany(raw: Raw, targets: readonly EntityId[]): Raw | undefined {
  const drop = new Set(targets.filter((id) => has(raw.map, id)).map(String));
  if (drop.size === 0) return undefined;
  const map: Record<EntityId, unknown> = {};
  for (const id of raw.ids) if (!drop.has(String(id))) map[id] = raw.map[id];
  return { ids: raw.ids.filter((id) => !drop.has(String(id))), map };
}

// Removal needs no id from the entity, so these take an optional bare config.
type RemoveArgs<C extends string | undefined> = [config?: { collection?: C }];

/** Removal works on any state that holds the collection, whatever its entity type. */
export type EntityRemover<C extends string | undefined> = <S extends EntityStateOf<unknown, C>>(state: S) => Partial<S>;

/** Removes the entity with this id. Missing ids are ignored. */
export function removeEntity<C extends string | undefined = undefined>(id: EntityId, ...[config]: RemoveArgs<C>): EntityRemover<C> {
  return build(config, (raw) => removeMany(raw, [id]));
}

/** Removes the entities with these ids, or matching a predicate. */
export function removeEntities<E, C extends string | undefined = undefined>(ids: readonly EntityId[] | Predicate<E>, ...[config]: RemoveArgs<C>): EntityRemover<C> {
  return build(config, (raw) => removeMany(raw, typeof ids === "function" ? raw.ids.filter((id) => ids(raw.map[id] as E)) : ids));
}

/** Removes every entity. */
export function removeAllEntities<C extends string | undefined = undefined>(...[config]: RemoveArgs<C>): EntityRemover<C> {
  return build(config, (raw) => (raw.ids.length === 0 ? undefined : { ids: [], map: {} }));
}
