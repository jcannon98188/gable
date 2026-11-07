import { computed, effect, signal, untracked, type ReadonlySignal } from "@gable/core";
import { inject } from "@gable/core";
import { currentScope, injectHost } from "@gable/core/internal";
import { MACHINE_ENV } from "./env.js";
import type { Machine, MachineSchema, Service } from "@zag-js/core";
import { VanillaMachine, normalizeProps } from "@zag-js/vanilla";
import type { NormalizeProps, PropTypes } from "@zag-js/types";

/** What `useMachine` returns. */
export interface MachineBinding<T extends MachineSchema, Api> {
  /** The connected API (state flags, prop getters, actions). A new object whenever the machine's state or context changes. */
  readonly api: ReadonlySignal<Api>;
  /** The Zag service behind it (send events, read `state`/`context`). */
  readonly service: Service<T>;
  /** The machine itself, for tests and escape hatches. */
  readonly machine: VanillaMachine<T>;
}

/**
 * Binds a Zag machine to signals. Call it during Setup (a field initialiser): the machine is owned by the
 * current scope, so it stops when the component is destroyed.
 *
 * - `props` is read once untracked to create the machine and then tracked by an effect, so reading signals
 *   (inputs, models) inside it keeps the machine's props in sync (`updateProps`).
 * - `connect` is the machine's connect function; its result is exposed as the `api` computed.
 */
export function useMachine<T extends MachineSchema, Api>(
  machine: Machine<T>,
  props: () => Partial<T["props"]>,
  connect: (service: Service<T>, normalize: NormalizeProps<PropTypes>) => Api,
): MachineBinding<T, Api> {
  const scope = currentScope();
  const { host } = injectHost<{ getRootNode?: unknown }>();
  const env = inject(MACHINE_ENV, { optional: true });
  const isDom = typeof host?.getRootNode === "function";
  const effects = env?.effects ?? isDom;
  const getRootNode = env?.getRootNode ? () => env.getRootNode!(host) : isDom ? undefined : () => ({ getElementById: () => null });
  if (!effects) machine = withoutEffects(machine);
  const resolve = () => ({ ...(getRootNode ? { getRootNode } : {}), ...props() }) as Partial<T["props"]>;
  const vm = new VanillaMachine<T>(machine, untracked(resolve));
  const version = signal(0);
  let stopped = false;
  const unsubscribe = vm.subscribe(() => {
    if (!stopped) version.update((n) => n + 1);
  });
  vm.start();
  scope?.onDispose(() => {
    stopped = true;
    unsubscribe();
    vm.stop();
  });
  let first = true;
  effect(() => {
    const next = resolve();
    if (first) {
      first = false;
      return;
    }
    untracked(() => vm.updateProps(next));
  });
  const api = computed(() => {
    version();
    return connect(vm.service, normalizeProps);
  });
  return { api, service: vm.service, machine: vm };
}

/** The same machine with every effect replaced by a no-op (effects are the DOM-only part of a machine). */
function withoutEffects<T extends MachineSchema>(machine: Machine<T>): Machine<T> {
  const effects = machine.implementations?.effects ?? {};
  return { ...machine, implementations: { ...machine.implementations, effects: Object.fromEntries(Object.keys(effects).map((k) => [k, () => {}])) } } as unknown as Machine<T>;
}
