import type { Renderer } from "./renderer.js";
import type { Env } from "./expression.js";
import { evaluate } from "./expression.js";
import { effect, reportError, untracked, whenFlushed } from "./signals.js";
import { currentScope } from "./scope.js";
import { DEV, InjectionToken } from "./di.js";
import { viewOf } from "./view-context.js";
import { buildNodes, createSwitcher, type Part } from "./view.js";
import type { DeferNode, TemplateNode } from "./template.js";

export type DeferState = "placeholder" | "loading" | "complete" | "error";

/** A live `@defer` block, as exposed to the test fixture. */
export interface DeferHandle {
  readonly state: DeferState;
  /** Fires the block now, as if one of its triggers had. */
  trigger(): void;
  /** Resolves once loading has finished and the resulting view update has flushed. */
  settle(): Promise<void>;
}

/** When provided, every `@defer` block built under this injector registers its handle here (removed on destroy). */
export const DEFER_BLOCKS = new InjectionToken<DeferHandle[]>("DeferBlocks");

const CORE_TRIGGERS = ["idle", "timer"];

function rendererName(renderer: Renderer<any>): string {
  return renderer.name ?? "(unnamed renderer)";
}

export function buildDefer<N>(node: DeferNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  const view = viewOf(env);
  const switcher = createSwitcher(renderer, parent, before);
  const scope = currentScope();
  const lazies = view?.lazies ?? [];
  let state: DeferState = "placeholder";
  let started = false;
  let loaded: Promise<void> = Promise.resolve();
  const disposers: Array<() => void> = [];
  /** The first element of the placeholder, which renderer triggers (viewport, hover) observe. */
  let placeholderNode: N | undefined;

  const show = (next: DeferState, children: TemplateNode[] | undefined, blockEnv: Env = env) => {
    state = next;
    switcher.show(
      children
        ? () => {
            const parts = buildNodes(children, renderer, blockEnv, parent, switcher.anchor);
            if (next === "placeholder") placeholderNode = parts[children.findIndex((n) => n.type === "element")]?.()[0];
            return parts;
          }
        : null,
    );
  };

  const stopTriggers = () => disposers.splice(0).forEach((d) => d());

  const complete = (components: readonly any[]) => {
    const blockEnv: Env = { instance: env.instance, locals: new Map(), parent: env };
    if (view) blockEnv.view = { ...view, imports: [...view.imports, ...components] };
    show("complete", node.children, blockEnv);
  };

  const fire = () => {
    if (started || scope?.disposed) return;
    started = true;
    stopTriggers();
    if (lazies.length === 0) return complete([]);
    show("loading", node.loading);
    loaded = Promise.all(lazies.map((entry) => entry.load())).then(
      (components) => {
        if (!scope?.disposed) untracked(() => complete(components));
      },
      (error) => {
        if (scope?.disposed) return;
        if (!node.error) reportError(error);
        untracked(() => show("error", node.error));
      },
    );
  };

  show("placeholder", node.placeholder);

  const handle: DeferHandle = {
    get state() {
      return state;
    },
    trigger: () => untracked(fire),
    async settle() {
      await loaded;
      await whenFlushed();
    },
  };
  const registry = view?.injector?.get(DEFER_BLOCKS, { optional: true }) ?? null;
  registry?.push(handle);
  scope?.onDispose(() => {
    stopTriggers();
    if (registry) registry.splice(registry.indexOf(handle) >>> 0, 1);
  });

  const triggers = node.triggers.length === 0 && !node.when ? [{ name: "idle", args: [] as unknown[] }] : node.triggers;
  for (const { name, args } of triggers) {
    if (name === "idle") {
      const ric = (globalThis as any).requestIdleCallback as ((cb: () => void) => number) | undefined;
      if (ric) {
        const id = ric(fire);
        disposers.push(() => (globalThis as any).cancelIdleCallback?.(id));
      } else {
        const id = setTimeout(fire, 1);
        disposers.push(() => clearTimeout(id));
      }
    } else if (name === "timer") {
      const id = setTimeout(fire, Number(args[0] ?? 0));
      disposers.push(() => clearTimeout(id));
    } else {
      const known = renderer.triggers;
      if (DEV && (!renderer.observeTrigger || (known && !known.includes(name)))) {
        const supported = [...CORE_TRIGGERS, ...(known ?? [])].join(", ");
        throw new Error(`Unknown @defer trigger "${name}" for renderer "${rendererName(renderer)}". Supported triggers: when, ${supported}.`);
      }
      if (renderer.observeTrigger) disposers.push(renderer.observeTrigger(name, args, placeholderNode, fire));
    }
  }

  if (node.when) {
    const when = node.when;
    effect(() => {
      if (started) return;
      if (evaluate(when, env)) untracked(fire);
    });
  }
  return switcher.part;
}
