/** Ownership tree: disposing a scope disposes its children and runs its cleanups. */
export interface Scope {
  /** Who owns this scope, for error attribution; unset means "same as the parent". */
  owner: ScopeOwner | undefined;
  readonly parent: Scope | null;
  /** Distance from the root scope; the scheduler runs shallower scopes first. */
  readonly depth: number;
  readonly disposed: boolean;
  onDispose(cleanup: () => void): void;
  dispose(): void;
}

export interface ScopeOwner {
  component?: Function;
  injector?: object;
  /** An error boundary: offered each failure reported from this scope or below; returns true when it took over. */
  boundary?: (error: unknown, source: string) => boolean;
}

/** The nearest owner information at or above `scope`. */
export function ownerOf(scope: Scope | null): { component?: Function; injector?: object } {
  let component: Function | undefined;
  let injector: object | undefined;
  for (let s = scope; s && (!component || !injector); s = s.parent) {
    component ??= s.owner?.component;
    injector ??= s.owner?.injector;
  }
  return { component, injector };
}

class ScopeImpl implements Scope {
  readonly depth: number;
  disposed = false;
  owner: ScopeOwner | undefined;
  #cleanups: Array<() => void> = [];
  #children = new Set<ScopeImpl>();

  constructor(readonly parent: ScopeImpl | null) {
    this.depth = parent ? parent.depth + 1 : 0;
    if (parent) parent.#children.add(this);
  }

  onDispose(cleanup: () => void): void {
    if (this.disposed) cleanup();
    else this.#cleanups.push(cleanup);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const child of [...this.#children]) child.dispose();
    for (const cleanup of this.#cleanups.splice(0).reverse()) cleanup();
    if (this.parent) this.parent.#children.delete(this);
  }
}

/**
 * Creates a scope that is disposed with `parent` (or stands alone when `parent` is `null`). Library authors use scopes to own effects, subscriptions and cleanups; application code gets one per component for free.
 *
 * @param parent - The owning scope, or `null` for a root.
 * @returns A new live scope.
 */
export function createScope(parent: Scope | null): Scope {
  return new ScopeImpl(parent as ScopeImpl | null);
}

let current: Scope | null = null;

/**
 * The scope that is running right now, or `null` outside any scope. Effects and `toSignal` register themselves with it.
 *
 * @returns The active scope, or `null`.
 */
export function currentScope(): Scope | null {
  return current;
}

/**
 * Runs `fn` with `scope` as the current scope, then restores the previous one, even if `fn` throws.
 *
 * @param scope - The scope to make current, or `null` for none.
 * @param fn - The work to run.
 * @returns Whatever `fn` returns.
 */
export function runInScope<T>(scope: Scope | null, fn: () => T): T {
  const previous = current;
  current = scope;
  try {
    return fn();
  } finally {
    current = previous;
  }
}

/**
 * Registers `fn` to run when the current scope (the component or block whose Setup is running) is disposed. Throws outside a scope.
 *
 * @param fn - The cleanup.
 */
export function onCleanup(fn: () => void): void {
  if (!current) throw new Error("onCleanup() called outside a scope (a component Setup, effect or block).");
  current.onDispose(fn);
}
