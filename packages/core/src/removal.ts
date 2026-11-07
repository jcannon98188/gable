import type { Renderer } from "./renderer.js";
import type { Scope } from "./scope.js";

// While control flow (@if, @switch, @for) disposes a body, cleanups can ask for its nodes to stay in the tree a little longer.
let batch: Promise<unknown>[] | null = null;

/**
 * Called from a scope cleanup (`scope.onDispose`): keeps the nodes of the body being removed in the tree until `until`
 * settles (fulfils or rejects), so a component can play an exit animation. The body's scope is already disposed by then:
 * only the held nodes outlive it, and they are removed whether or not anything else still references them.
 * Returns false when nothing is being removed by control flow (a whole-app or component teardown, or a call outside a
 * cleanup): the caller then has nothing to wait for and should finish at once.
 */
export function holdRemoval(until: PromiseLike<unknown>): boolean {
  if (!batch) return false;
  batch.push(Promise.resolve(until));
  return true;
}

/** Disposes `scope` and removes `nodes`, deferring the removal until every `holdRemoval` made during the disposal settles. */
export function disposeAndRemove<N>(renderer: Renderer<N>, scope: Scope | null, nodes: N[]): void {
  const outer = batch;
  const mine: Promise<unknown>[] = (batch = []);
  try {
    scope?.dispose();
  } finally {
    batch = outer;
  }
  const remove = () => {
    for (const node of nodes) renderer.remove(node);
  };
  if (mine.length === 0) remove();
  else void Promise.allSettled(mine).then(remove);
}
