import { DEV } from "./dev-hooks.js";

/** What a component's Setup sees while it runs: the dev runtime's store for this instance (undefined without a hot-update runtime). */
export const setup: { active: boolean; store: Map<string, unknown> | undefined } = { active: false, store: undefined };

/** Set by the hot-update runtime while it retires the old instances of an update. */
export const hotUpdate = { retiring: false };

/**
 * Dev only: true while a hot update retires the components it replaced, so a resource owner can tell a rebuild (keep the
 * resource for the replacement) from a real unmount (release it). Always false in production.
 */
export function isHotUpdating(): boolean {
  return DEV && hotUpdate.retiring;
}

/**
 * Dev only: a value a component owns that cannot be copied (a GPU context, a socket, a worker) and so must survive a
 * hot edit of the component. Call it in a field initialiser. The first call for this component instance runs `create`;
 * when a hot update re-creates the component, the replacement instance gets the stored value for `key` back and `create`
 * is not called, so no throwaway second resource is built. In production, and wherever no hot-update runtime is loaded,
 * this just calls `create`.
 *
 * @param key - Names the value among the component's hot data.
 * @param create - Builds the value the first time.
 */
export function hotData<T>(key: string, create: () => T): T {
  if (!DEV) return create();
  if (!setup.active) throw new Error("hotData() called outside a component Setup (a field initialiser).");
  const store = setup.store;
  if (!store) return create();
  if (store.has(key)) return store.get(key) as T;
  const value = create();
  store.set(key, value);
  return value;
}
