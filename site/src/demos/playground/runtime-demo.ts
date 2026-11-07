import { computed, createComponent, createInjector, ErrorHandler, RENDERER, signal, type ComponentClass } from "@gable/core";
import type { Renderer } from "@gable/core/renderer";

/** The state a playground template can read. Everything here is an ordinary Gable field. */
export class DemoState {
  name = signal("Ada");
  show = signal(true);
  count = signal(0);
  items = signal([
    { id: 1, label: "Parse the template at runtime" },
    { id: 2, label: "Render it with the real DOM renderer" },
    { id: 3, label: "Ship no compiler" },
  ]);
  loud = computed(() => this.name().toUpperCase());
  total = computed(() => this.items().length);
  inc(): void {
    this.count.update((n) => n + 1);
  }
  toggle(): void {
    this.show.update((v) => !v);
  }
  add(): void {
    this.items.update((list) => [...list, { id: list.length + 1, label: `Item ${list.length + 1}` }]);
  }
  clear(): void {
    this.items.set([]);
  }
}

/**
 * A component class whose template is the given string. It is the same thing `html\`...\`` produces, built at
 * runtime: the template parser and the renderer are Gable's own, with nothing compiled ahead of time.
 */
export function componentFor(source: string): ComponentClass<DemoState> {
  class Demo extends DemoState {
    static meta = { selector: "pg-demo", template: { strings: Object.assign([source], { raw: [source] }) as TemplateStringsArray, values: [] } };
  }
  return Demo;
}

export interface Rendered {
  /** The error Gable raised while parsing or first rendering, in its own words; null when the template is good. */
  error: string | null;
  /** The mounted host (null on error). Hand it to `destroy` when it is replaced. */
  destroy: (() => void) | null;
}

/** Turns anything thrown or reported into the message Gable wrote. */
export function messageOf(error: unknown): string {
  if (error instanceof AggregateError) return error.errors.map(messageOf).join("\n");
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parses `source` and renders it into `into` with the real renderer, in a fresh injector whose ErrorHandler collects
 * failures. A bad template fails here (parse errors throw; binding errors are reported), and `into` is left empty.
 */
export async function renderTemplate<N>(source: string, renderer: Renderer<N>, into: N, host: N): Promise<Rendered> {
  const failures: unknown[] = [];
  class Collector extends ErrorHandler {
    override handleError(error: unknown): void {
      failures.push(error);
    }
  }
  // Like bootstrap(): a fresh root injector, so nothing of the page leaks in and the collector sees every failure.
  const injector = createInjector([{ provide: RENDERER, useValue: renderer }, ...(renderer.providers ?? []), { provide: ErrorHandler, useClass: Collector }]);
  let ref: ReturnType<typeof createComponent<DemoState, N>> | null = null;
  try {
    ref = createComponent(componentFor(source), { renderer, injector, host });
    renderer.insert(into, host);
    // Effects (bindings) run in a microtask: wait so a broken binding is caught before this render replaces the last good one.
    await Promise.resolve();
    await Promise.resolve();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    try {
      ref?.destroy();
      renderer.remove(host);
    } catch {
      /* the failed render is being discarded */
    }
    return { error: messageOf(failures[0]), destroy: null };
  }
  return {
    error: null,
    destroy: () => {
      ref?.destroy();
      renderer.remove(host);
    },
  };
}

