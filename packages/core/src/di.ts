import { createScope, runInScope, type Scope } from "./scope.js";

/** Dev-only checks are gated on this so bundlers can drop them (`define: { __GABLE_DEV__: false }`). */
declare const __GABLE_DEV__: boolean | undefined;
const DEV = typeof __GABLE_DEV__ === "undefined" || __GABLE_DEV__ !== false;

/** A class used as a Token. Abstract classes work too. */
export type Type<T> = abstract new () => T;

/** A typed key for values that are not classes. */
export class InjectionToken<T> {
  /** Phantom member so `T` is inferable. Never set. */
  declare readonly __type?: T;
  constructor(readonly description: string) {}
  toString(): string {
    return `InjectionToken(${this.description})`;
  }
}

export type Token<T> = Type<T> | InjectionToken<T>;

export type Provider =
  | Type<unknown>
  | { provide: Token<any>; useClass: Type<unknown> }
  | { provide: Token<any>; useValue: unknown }
  | { provide: Token<any>; useFactory: () => unknown }
  | { provide: Token<any>; useExisting: Token<any> };

export interface InjectOptions {
  /** Return `null` instead of throwing when nothing provides the Token. */
  optional?: boolean;
  /** Only look in the current injector. */
  self?: boolean;
  /** Start at the parent injector. */
  skipSelf?: boolean;
  /** Stop at the nearest host injector (a component's own injector). */
  host?: boolean;
}

export interface Injector {
  readonly parent: Injector | null;
  readonly destroyed: boolean;
  get<T>(token: Token<T>, options?: InjectOptions): T | null;
  /** Runs `fn` in this injector's injection context, so `inject()` works inside it. */
  run<T>(fn: () => T): T;
  createChild(providers: Provider[], options?: { host?: boolean }): Injector;
  destroy(): void;
}

interface Entry {
  resolving: boolean;
  resolved: boolean;
  value: unknown;
  make: () => unknown;
}

let current: InjectorImpl | null = null;

function name(token: Token<unknown>): string {
  return token instanceof InjectionToken ? token.toString() : ((token as { name?: string }).name ?? "anonymous class");
}

const CONSTRUCTOR = /(^|[\s;{}])constructor\s*\(/;

export function assertNoConstructor(Class: Type<unknown>): void {
  if (!DEV) return;
  const source = Function.prototype.toString.call(Class);
  if (source.startsWith("class") && CONSTRUCTOR.test(source.slice(source.indexOf("{")))) {
    throw new Error(
      `${name(Class)} declares a constructor. Gable classes have no constructors: use field initialisers (and inject()) instead.`,
    );
  }
}

function isRootScoped(token: Token<unknown>): token is Type<unknown> {
  return typeof token === "function" && (token as { scope?: unknown }).scope === "root";
}

class InjectorImpl implements Injector {
  destroyed = false;
  readonly root: InjectorImpl;
  readonly scope: Scope;
  #records = new Map<Token<unknown>, Entry>();
  #children = new Set<InjectorImpl>();

  constructor(
    providers: Provider[],
    readonly parent: InjectorImpl | null,
    private readonly host: boolean,
  ) {
    this.root = parent ? parent.root : this;
    this.scope = createScope(parent ? parent.scope : null);
    if (parent) parent.#children.add(this);
    for (const p of providers) this.#register(p);
  }

  #register(provider: Provider): void {
    const rec = (provide: Token<unknown>, make: () => unknown) =>
      { this.#records.set(provide, { resolving: false, resolved: false, value: undefined, make }); };
    if (typeof provider === "function") return rec(provider, () => this.#construct(provider));
    const { provide } = provider;
    if ("useValue" in provider) rec(provide, () => provider.useValue);
    else if ("useClass" in provider) rec(provide, () => this.#construct(provider.useClass));
    else if ("useFactory" in provider) rec(provide, () => this.#inContext(provider.useFactory));
    else rec(provide, () => this.#inContext(() => inject(provider.useExisting)));
  }

  #inContext<T>(fn: () => T): T {
    const previous = current;
    current = this;
    try {
      return runInScope(this.scope, fn);
    } finally {
      current = previous;
    }
  }

  #construct(Class: Type<unknown>): unknown {
    assertNoConstructor(Class);
    return this.#inContext(() => new (Class as unknown as new () => unknown)());
  }

  #resolveHere(token: Token<unknown>, rec: Entry): unknown {
    if (!rec.resolved) {
      if (rec.resolving) throw new Error(`Circular dependency while resolving ${name(token)}.`);
      rec.resolving = true;
      try {
        rec.value = rec.make();
        rec.resolved = true;
      } finally {
        rec.resolving = false;
      }
    }
    return rec.value;
  }

  get<T>(token: Token<T>, options: InjectOptions = {}): T | null {
    if (this.destroyed) throw new Error("Injector has been destroyed.");
    let at: InjectorImpl | null = options.skipSelf ? this.parent : this;
    let stopped = false;
    while (at) {
      const rec = at.#records.get(token);
      if (rec) return at.#resolveHere(token, rec) as T;
      if (options.self || (options.host && at.host)) {
        stopped = true;
        break;
      }
      at = at.parent;
    }
    if (!stopped && isRootScoped(token)) {
      const root = this.root;
      const rec: Entry = { resolving: false, resolved: false, value: undefined, make: () => root.#construct(token) };
      root.#records.set(token, rec);
      return root.#resolveHere(token, rec) as T;
    }
    if (options.optional) return null;
    throw new Error(`No provider for ${name(token)}.`);
  }

  run<T>(fn: () => T): T {
    if (this.destroyed) throw new Error("Injector has been destroyed.");
    return this.#inContext(fn);
  }

  createChild(providers: Provider[], options: { host?: boolean } = {}): Injector {
    return new InjectorImpl(providers, this, options.host ?? false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const child of [...this.#children]) child.destroy();
    this.scope.dispose();
    if (this.parent) this.parent.#children.delete(this);
  }
}

/** Creates a root injector, or a child when `parent` is given. */
export function createInjector(providers: Provider[] = [], parent: Injector | null = null): Injector {
  return parent ? parent.createChild(providers) : new InjectorImpl(providers, null, false);
}

/** Resolves a Token from the current injection context (field initialisers, factories, `injector.run`). */
export function inject<T>(token: Token<T>, options: InjectOptions & { optional: true }): T | null;
export function inject<T>(token: Token<T>, options?: InjectOptions): T;
export function inject<T>(token: Token<T>, options?: InjectOptions): T | null {
  if (!current) throw new Error(`inject(${name(token)}) called outside an injection context.`);
  return current.get(token, options);
}

