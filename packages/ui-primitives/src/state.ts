import type { Type } from "@gable/core";
import { useMachine, type MachineBinding } from "./machine.js";
import { uniqueId } from "./id.js";

/** What every machine state class (`DialogState`, `PopoverState`, ...) looks like. */
export interface MachineState<Props, Api> {
  readonly id: string;
  binding: MachineBinding<any, Api>;
  readonly api: MachineBinding<any, Api>["api"];
  /** Creates the machine. Call it in Setup, from the component that lists the state in `providers`. */
  bind(props: () => Partial<Props>): this;
}

/**
 * Builds the state class for one Zag machine, the same shape as `DialogState` and `TabsState`:
 *
 *   export class PopoverState extends machineState<popover.Props, popover.Api>("popover", popover.machine, popover.connect) {}
 *
 * The component that declares the template lists it in `providers` and calls `inject(PopoverState).bind(() => props)`.
 */
export function machineState<Props, Api>(prefix: string, machine: unknown, connect: unknown): Type<MachineState<Props, Api>> {
  return class State implements MachineState<Props, Api> {
    id = uniqueId(prefix);
    binding!: MachineBinding<any, Api>;
    get api() {
      return this.binding.api;
    }
    bind(props: () => Partial<Props>): this {
      this.binding = useMachine<any, Api>(machine as any, () => ({ id: this.id, ...props() }) as any, connect as any);
      return this;
    }
  } as unknown as Type<MachineState<Props, Api>>;
}
