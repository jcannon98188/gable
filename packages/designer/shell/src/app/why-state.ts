// The selected element's reactive dependencies and the reasons it updated (TASK-56.19), for the Why tab and MCP. The Preview
// agent asks the devtools hook (`whyNode`, `why`); the hook records which signal writes made each effect run while the
// Designer is connected. This service refetches (debounced) when the selection or a flush changes and the tab is open, and
// keeps the canvas flash ("Highlight updates") on across frame reloads.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import type { WhyShown } from "../../../src/why.js";

export type WhyScope = "element" | "component";

export class WhyState {
  static scope = "root";
  state = inject(DesignerState);
  chrome = inject(ChromeState);

  scope = signal<WhyScope>("element");
  shown = signal<WhyShown | null>(null);
  /** Why there is nothing to show (nothing selected, not connected, no hook). */
  empty = signal("");
  /** Whether the agent outlines the elements that update. */
  highlight = signal(false);
  highlightError = signal("");

  #timer: ReturnType<typeof setTimeout> | undefined;
  #run = 0;

  /** The tab is open (or an agent asked): refetch when the selection, the scope or a flush changes. */
  watch = effect(() => {
    this.state.flushes();
    this.state.picked();
    this.state.component();
    this.scope();
    const ready = this.state.connection() === "ready";
    const wanted = this.chrome.drawerOpen() && this.chrome.drawerTab() === "why";
    untracked(() => {
      if (!ready) return void (this.shown.set(null), this.empty.set("The frame is not connected."));
      if (!wanted) return;
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => void this.refresh(), 150);
    });
  });

  /** The agent's flash is per page: turn it back on when the frame (re)connects. */
  flash = effect(() => {
    const on = this.highlight();
    const ready = this.state.connection() === "ready";
    if (ready) untracked(() => void this.state.preview.call("flashUpdates", { on }).then(() => this.highlightError.set(""), (e: Error) => this.highlightError.set(e.message)));
  });

  /** Reads what `scope` shows now; null (with `empty` saying why) when there is nothing. */
  async refresh(scope: WhyScope = this.scope()): Promise<WhyShown | null> {
    const run = ++this.#run;
    const done = (shown: WhyShown | null, empty = ""): WhyShown | null => {
      if (run === this.#run) (this.shown.set(shown), this.empty.set(empty));
      return shown;
    };
    if (this.state.connection() !== "ready") return done(null, "The frame is not connected.");
    const picked = this.state.picked();
    const component = this.state.component();
    try {
      if (scope === "element") {
        if (!picked) return done(null, "Select an element on the canvas to see what its bindings depend on.");
        const r = await this.state.preview.call("whyNode", { id: picked.node.id });
        if (!r) return done(null, "The selected element is no longer rendered.");
        return done({ scope, title: `<${r.tag}>`, component: r.component, nodes: r.nodes, elsewhere: r.elsewhere });
      }
      const owner = component ? { id: component.id, name: component.name } : null;
      if (!owner) return done(null, "Select an element, or a component in the structure tree, to see its effects.");
      const r = await this.state.preview.call("why", { id: owner.id });
      if (!r) return done(null, `${owner.name} is no longer rendered.`);
      return done({ scope, title: r.name, component: owner, nodes: r.nodes, elsewhere: r.more });
    } catch (e) {
      return done(null, e instanceof Error ? e.message : String(e));
    }
  }

  /** An explicit target (a component, signal or effect id): the hook's report for it, without changing the tab. */
  async explain(id: string): Promise<WhyShown | null> {
    const r = await this.state.preview.call("why", { id });
    if (!r) return null;
    const owner = r.nodes.find((n) => n.owner)?.owner ?? null;
    return { scope: "component", title: r.name, component: r.kind === "component" ? { id: r.id, name: r.name } : owner, nodes: r.nodes, elsewhere: r.more };
  }

  setScope(scope: WhyScope): void {
    this.scope.set(scope);
  }

  setHighlight(on: boolean): void {
    this.highlight.set(on);
  }

  summary = computed(() => {
    const s = this.shown();
    return s ? `${s.nodes.length} binding${s.nodes.length === 1 ? "" : "s"} of ${s.title}` : "";
  });
}
