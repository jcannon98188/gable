import type { StoreFeature, StoreShape } from "./store.js";

/** Carries a type to `signalStoreFeature` and `withEntities` without a runtime value: `type<{ count: number }>()`. */
export function type<T>(): T {
  return undefined as T;
}

/** What a feature requires from the store it is added to. Each key lists members as types. */
export interface FeatureInput {
  state?: object;
  props?: object;
  methods?: object;
}

type Prettify<T> = { [K in keyof T]: T[K] } & {};

type EmptyShape = { state: {}; props: {}; methods: {} };

type Merge<A extends StoreShape, B extends StoreShape> = {
  state: Prettify<A["state"] & B["state"]>;
  props: Prettify<A["props"] & B["props"]>;
  methods: Prettify<A["methods"] & B["methods"]>;
};

/** The store shape a `FeatureInput` describes. Missing keys are empty. */
export type InputShape<I extends FeatureInput> = {
  state: I extends { state: infer S extends object } ? S : {};
  props: I extends { props: infer P extends object } ? P : {};
  methods: I extends { methods: infer M extends object } ? M : {};
};

/**
 * A feature that needs `In` from the store before it. Generic in the store it is added to, so TypeScript checks the requirement
 * after it has inferred the earlier features, not while (which loses the inline `withState` types).
 */
export type InputFeature<In extends StoreShape, Out extends StoreShape> = <S extends In>(...args: Parameters<StoreFeature<S, Out>>) => ReturnType<StoreFeature<S, Out>>;

type E = EmptyShape;

/**
 * Bundles features into one reusable feature. With an input spec, the result can only be added to a store that already
 * has those members, and the bundled features see them:
 *
 * ```ts
 * const withCounter = signalStoreFeature(
 *   { state: type<{ count: number }>() },
 *   withComputed((s) => ({ double: () => s.count() * 2 })),
 * );
 * ```
 *
 * The result adds only what the bundled features add, not the input. 1 to 5 features.
 */
export function signalStoreFeature<A extends StoreShape>(a: StoreFeature<E, A>): StoreFeature<E, A>;
export function signalStoreFeature<A extends StoreShape, B extends StoreShape>(a: StoreFeature<E, A>, b: StoreFeature<Merge<E, A>, B>): StoreFeature<E, Merge<A, B>>;
export function signalStoreFeature<A extends StoreShape, B extends StoreShape, C extends StoreShape>(
  a: StoreFeature<E, A>,
  b: StoreFeature<Merge<E, A>, B>,
  c: StoreFeature<Merge<Merge<E, A>, B>, C>,
): StoreFeature<E, Merge<Merge<A, B>, C>>;
export function signalStoreFeature<A extends StoreShape, B extends StoreShape, C extends StoreShape, D extends StoreShape>(
  a: StoreFeature<E, A>,
  b: StoreFeature<Merge<E, A>, B>,
  c: StoreFeature<Merge<Merge<E, A>, B>, C>,
  d: StoreFeature<Merge<Merge<Merge<E, A>, B>, C>, D>,
): StoreFeature<E, Merge<Merge<Merge<A, B>, C>, D>>;
export function signalStoreFeature<A extends StoreShape, B extends StoreShape, C extends StoreShape, D extends StoreShape, F extends StoreShape>(
  a: StoreFeature<E, A>,
  b: StoreFeature<Merge<E, A>, B>,
  c: StoreFeature<Merge<Merge<E, A>, B>, C>,
  d: StoreFeature<Merge<Merge<Merge<E, A>, B>, C>, D>,
  e: StoreFeature<Merge<Merge<Merge<Merge<E, A>, B>, C>, D>, F>,
): StoreFeature<E, Merge<Merge<Merge<Merge<A, B>, C>, D>, F>>;

export function signalStoreFeature<I extends FeatureInput, A extends StoreShape>(input: I, a: StoreFeature<InputShape<I>, A>): InputFeature<InputShape<I>, A>;
export function signalStoreFeature<I extends FeatureInput, A extends StoreShape, B extends StoreShape>(
  input: I,
  a: StoreFeature<InputShape<I>, A>,
  b: StoreFeature<Merge<InputShape<I>, A>, B>,
): InputFeature<InputShape<I>, Merge<A, B>>;
export function signalStoreFeature<I extends FeatureInput, A extends StoreShape, B extends StoreShape, C extends StoreShape>(
  input: I,
  a: StoreFeature<InputShape<I>, A>,
  b: StoreFeature<Merge<InputShape<I>, A>, B>,
  c: StoreFeature<Merge<Merge<InputShape<I>, A>, B>, C>,
): InputFeature<InputShape<I>, Merge<Merge<A, B>, C>>;
export function signalStoreFeature<I extends FeatureInput, A extends StoreShape, B extends StoreShape, C extends StoreShape, D extends StoreShape>(
  input: I,
  a: StoreFeature<InputShape<I>, A>,
  b: StoreFeature<Merge<InputShape<I>, A>, B>,
  c: StoreFeature<Merge<Merge<InputShape<I>, A>, B>, C>,
  d: StoreFeature<Merge<Merge<Merge<InputShape<I>, A>, B>, C>, D>,
): InputFeature<InputShape<I>, Merge<Merge<Merge<A, B>, C>, D>>;
export function signalStoreFeature<I extends FeatureInput, A extends StoreShape, B extends StoreShape, C extends StoreShape, D extends StoreShape, F extends StoreShape>(
  input: I,
  a: StoreFeature<InputShape<I>, A>,
  b: StoreFeature<Merge<InputShape<I>, A>, B>,
  c: StoreFeature<Merge<Merge<InputShape<I>, A>, B>, C>,
  d: StoreFeature<Merge<Merge<Merge<InputShape<I>, A>, B>, C>, D>,
  e: StoreFeature<Merge<Merge<Merge<Merge<InputShape<I>, A>, B>, C>, D>, F>,
): InputFeature<InputShape<I>, Merge<Merge<Merge<Merge<A, B>, C>, D>, F>>;
export function signalStoreFeature(...args: unknown[]): unknown {
  const features = args.filter((a): a is (store: object) => object => typeof a === "function");
  return (store: object) => {
    for (const feature of features) feature(store);
    return store;
  };
}
