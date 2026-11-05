import { DEV } from "./di.js";

const store = DEV ? new Map<string, unknown>() : null;

/**
 * Module-level state that survives edits to its module: returns the stored value for `key` if there is one,
 * else runs `init`. In production this is just `init()`. The old value wins when `init` is edited;
 * `{ reset: true }` or renaming the key discards it.
 */
export function hotState<T>(meta: { url: string; hot?: unknown }, key: string, init: () => T, options: { reset?: boolean } = {}): T {
  if (!DEV || !store || !meta.hot) return init();
  const id = `${meta.url.replace(/[?#].*$/, "")}\0${key}`;
  if (!options.reset && store.has(id)) return store.get(id) as T;
  const value = init();
  store.set(id, value);
  return value;
}
