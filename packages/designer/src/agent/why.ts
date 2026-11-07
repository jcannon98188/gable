// "Why did this update" in the Preview agent (TASK-56.19): the reactive dependencies of one template node, and the canvas flash
// of the elements whose bindings re-ran. Everything comes from the devtools hook of @gable/core (`why`, `effectsOf`,
// `targetsOf`): the hook finds the signal writes behind each effect run while a client is connected, nothing here guesses.
import type { DesignerHook } from "@gable/core/designer";
import type { EffectRun, GableDevtoolsHook, WhyNode } from "@gable/core/devtools";
import type { WhyElementReport } from "../protocol.js";

/** The effects that update template node `id`, with their dependencies and recent causes. */
export async function whyNode(devtools: GableDevtoolsHook, designer: DesignerHook, id: string): Promise<WhyElementReport | null> {
  const elements = designer.elementsOf(id);
  const first = elements.find((el) => (el as { isConnected?: boolean }).isConnected !== false) ?? elements[0];
  if (!first) return null;
  const node = designer.nodeOf(first);
  const bound = new Set(devtools.effectsOf(elements));
  const nodes: WhyNode[] = [];
  for (const effectId of bound) {
    const report = await devtools.call("why", { id: effectId });
    if (report) nodes.push(...report.nodes);
  }
  let elsewhere = 0;
  if (node?.component) {
    const owner = await devtools.call("why", { id: node.component.id });
    if (owner) elsewhere = Math.max(0, owner.nodes.filter((n) => !bound.has(n.id)).length + owner.more);
  }
  return { id, tag: node?.tag ?? "", component: node?.component ? { id: node.component.id, name: node.component.name } : null, nodes, elsewhere };
}

/** At most this many elements are outlined for one flush. */
export const MAX_FLASHES = 60;
const FLASH_MS = 900;
const FLASH = "#f59e0b";

/** Outlines the elements whose bindings ran again in a flush, fading out; what the Designer's "Highlight updates" turns on. */
export class UpdateFlasher {
  on = false;
  readonly #layer: HTMLElement;
  readonly #devtools: () => GableDevtoolsHook | undefined;

  constructor(layer: HTMLElement, devtools: () => GableDevtoolsHook | undefined) {
    this.#layer = layer;
    this.#devtools = devtools;
  }

  /** The runs of one flush: the effects that ran again (a first run is a creation, not an update). */
  flush(runs: EffectRun[]): number {
    const hook = this.#devtools();
    if (!this.on || !hook) return 0;
    const ids = runs.filter((r) => !r.first).map((r) => r.id);
    if (!ids.length) return 0;
    let shown = 0;
    for (const el of hook.targetsOf(ids) as Element[]) {
      if (shown >= MAX_FLASHES) break;
      if (!el.isConnected || this.#layer.contains(el) || typeof el.getBoundingClientRect !== "function") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const box = document.createElement("div");
      box.setAttribute("data-gable-flash", "");
      box.style.cssText = `position:fixed;box-sizing:border-box;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border:2px solid ${FLASH};background:${FLASH}22;border-radius:2px`;
      this.#layer.append(box);
      const done = () => box.remove();
      if (typeof box.animate === "function") box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLASH_MS, easing: "ease-out" }).addEventListener("finish", done);
      else setTimeout(done, FLASH_MS);
      shown++;
    }
    return shown;
  }

  /** Clears whatever is still showing. */
  clear(): void {
    for (const box of this.#layer.querySelectorAll("[data-gable-flash]")) box.remove();
  }
}
