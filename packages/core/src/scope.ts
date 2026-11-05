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

export function createScope(parent: Scope | null): Scope {
  return new ScopeImpl(parent as ScopeImpl | null);
}

let current: Scope | null = null;

export function currentScope(): Scope | null {
  return current;
}

export function runInScope<T>(scope: Scope | null, fn: () => T): T {
  const previous = current;
  current = scope;
  try {
    return fn();
  } finally {
    current = previous;
  }
}
