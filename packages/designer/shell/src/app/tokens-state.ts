// Design tokens (TASK-56.23): the project's CSS custom properties as the backend reads them (`/api/tokens/*`), the uses of
// one, and the tokens the selected element reads. Edits go through EditState as the `setToken` op, so a token edit is a
// minimal patch on the same undo history (toast with Undo, Ctrl+Z) as every other edit. Nothing is read in the shell itself.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import type { ElementToken, TokenDef, TokenInfo, TokenList, TokenTarget, TokenUsage, TokenUsagesResult } from "../../../src/server/tokens/types.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";
import { TailwindState } from "./tailwind-state.js";

/** A stylesheet change arrives as several events (files, tailwind, history): read the list once they settle. */
const SETTLE_MS = 150;
/** A call to a frame that reloaded meanwhile is never answered. */
const within = <T>(p: Promise<T>, ms = 2000): Promise<T | null> => Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

export class TokensState {
  static scope = "root";
  state = inject(DesignerState);
  edit = inject(EditState);
  tw = inject(TailwindState);

  /** Null until the backend answered. */
  list = signal<TokenList | null>(null);
  error = signal<string | null>(null);
  byName = computed(() => new Map((this.list()?.tokens ?? []).map((t) => [t.name, t])));
  /** The token the Tokens tab reveals and opens (a click on an element's token in the Style tab sets it). */
  focus = signal<string | null>(null);
  /** Usages by token name, read when a token is opened; dropped when the list is read again. */
  usages = signal<Record<string, TokenUsage[] | { error: string }>>({});
  /** The tokens the selected element reads (its classes through the design system, its style, project rules for its classes). */
  element = signal<ElementToken[]>([]);

  #timer: ReturnType<typeof setTimeout> | null = null;
  #booted = false;
  booted = this.#boot();

  async #boot(): Promise<void> {
    await this.state.booted;
    await this.refresh();
    this.#booted = true;
  }

  /**
   * Reads the list again when the backend's events say a file changed. No EventSource of its own: the shell already holds
   * several open to the backend and a browser allows six connections per host, so one more would stall every later request.
   * The signals those streams set are enough: the edit history (`history`), Tailwind's info (`tailwind`: a stylesheet
   * changed) and the scene files (`files`: anything in the project changed).
   */
  followChanges = effect(() => {
    this.edit.history();
    this.tw.info();
    this.state.sceneFiles();
    untracked(() => this.#booted && this.#later());
  });

  #later(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.refresh();
    }, SETTLE_MS);
  }

  async refresh(): Promise<void> {
    try {
      const r = await this.state.api<TokenList | { ok: false; error: string }>("/api/tokens/list");
      if (!r.ok) return void this.error.set(r.error);
      this.error.set(null);
      this.list.set(r);
      // Uses may have moved with the change: read the open ones again.
      const open = Object.keys(untracked(() => this.usages()));
      this.usages.set({});
      for (const name of open) if (r.tokens.some((t) => t.name === name)) void this.loadUsages(name);
      this.#readElement();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  async loadUsages(name: string): Promise<void> {
    const r = await this.state.api<TokenUsagesResult>("/api/tokens/usages", { name }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    this.usages.update((u) => ({ ...u, [name]: r.ok ? r.usages : { error: r.error } }));
  }

  forgetUsages(name: string): void {
    this.usages.update((u) => {
      const { [name]: _gone, ...rest } = u;
      return rest;
    });
  }

  // --- editing -------------------------------------------------------------------------------------------------------------

  /** Sets the light or dark value (the definition that wins there, or an override of a package token). */
  async set(t: TokenInfo, scheme: "light" | "dark", value: string): Promise<boolean> {
    const target = scheme === "dark" ? t.edit.dark : t.edit.light;
    return target ? this.write(t.name, target, value) : false;
  }

  /** Sets (or with null removes) one definition as listed. */
  async setDef(d: TokenDef, value: string | null): Promise<boolean> {
    return d.target ? this.write(d.name, d.target, value) : false;
  }

  async write(name: string, target: TokenTarget, value: string | null): Promise<boolean> {
    const r = await this.edit.apply({ op: "setToken", file: target.file, name, selector: target.selector, atRules: target.atRules, value, expect: target.expect });
    // The history event refreshes too; reading now shows the new value without waiting for it.
    if (r?.ok) await this.refresh();
    return !!r?.ok;
  }

  // --- jumping to a use ----------------------------------------------------------------------------------------------------

  /** Selects the element a use is on: a template use by its position, a CSS use by its rule's selector. False when none renders. */
  async jump(u: TokenUsage): Promise<boolean> {
    const preview = this.state.preview;
    const node =
      u.raw !== undefined && u.offset !== undefined
        ? await within(preview.call("nodeAt", { raw: u.raw, offset: u.offset }))
        : u.selector
          ? await within(preview.call("nodeBySelector", { selector: u.selector }))
          : null;
    if (!node) return false;
    await within(preview.call("selectNode", { id: node.id }));
    return true;
  }

  // --- the selected element ------------------------------------------------------------------------------------------------

  #elementSeq = 0;
  readOnPick = effect(() => {
    this.edit.node();
    untracked(() => this.#readElement());
  });

  #readElement(): void {
    const n = this.edit.node();
    const seq = ++this.#elementSeq;
    const attr = (name: string) => n?.attrs.find((a) => a.name === name && a.kind === "static")?.value ?? "";
    const classes = attr("class");
    const style = attr("style");
    if (!n || (!classes && !style)) return void this.element.set([]);
    void this.state
      .api<{ ok: boolean; tokens?: ElementToken[] }>("/api/tokens/element", { classes, style })
      .then((r) => seq === this.#elementSeq && this.element.set(r.tokens ?? []))
      .catch(() => seq === this.#elementSeq && this.element.set([]));
  }
}
