// The window itself: theme, which tabs and dialogs are open, and the panel sizes. Remembered per project through the backend
// (see ChromeSettings in devices.ts), never in the browser, whose origin changes with every launch of the desktop app.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import type { ChromeSettings } from "../../../src/devices.js";
import { DesignerState } from "./designer-state.js";

export type DialogName = "open-project" | "connect" | "server-log" | "extract" | "new-scenario" | "rename" | "find-uses" | null;

/** Canvas and drawer heights while the drawer is closed: the canvas takes everything and the tab strip sits under it. */
const DRAWER_CLOSED = [100, 0];
const DRAWER_DEFAULT = [68, 32];

export class ChromeState {
  static scope = "root";
  state = inject(DesignerState);

  theme = signal<ChromeSettings["theme"]>("system");
  /** The system's preference, for `theme: "system"`. */
  prefersDark = signal(typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : true);
  dark = computed(() => (this.theme() === "system" ? this.prefersDark() : this.theme() === "dark"));

  left = signal("structure");
  right = signal("style");
  drawerTab = signal("code");
  drawerOpen = signal(false);
  dialog = signal<DialogName>(null);
  paletteOpen = signal(false);

  /** Left, centre, right, in percent. Empty until the group reports its defaults. */
  panels = signal<number[]>([]);
  /** Canvas, drawer: what the vertical group is showing right now. */
  column = signal<number[]>(DRAWER_CLOSED);
  /** The drawer's split while it is open, so closing and reopening it keeps its height. */
  #openColumn = signal<number[] | null>(null);

  applyTheme = effect(() => {
    const dark = this.dark();
    const root = (globalThis as { document?: Document }).document?.documentElement;
    root?.classList.toggle("dark", dark);
  });

  #watchSystem = (() => {
    if (typeof matchMedia !== "function") return;
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => this.prefersDark.set(e.matches));
  })();

  #restored = false;
  restore = effect(() => {
    if (!this.state.frames.settled() || this.#restored) return;
    this.#restored = true;
    const saved = untracked(() => this.state.frames.chrome());
    if (!saved) return;
    untracked(() => {
      this.theme.set(saved.theme);
      this.right.set(saved.rightTab);
      this.drawerTab.set(saved.drawerTab);
      if (saved.panels) this.panels.set(saved.panels);
      if (saved.column) this.#openColumn.set(saved.column);
      this.setDrawer(saved.drawerOpen);
    });
  });

  /** Keeps the drawer's open height as the user drags it. */
  rememberColumn = effect(() => {
    const column = this.column();
    if (untracked(this.drawerOpen) && column.length === 2 && column[1]! > 0) untracked(() => this.#openColumn.set(column));
  });

  save = effect(() => {
    const snapshot: ChromeSettings = {
      theme: this.theme(),
      panels: this.panels().length === 3 ? this.panels() : null,
      column: this.#openColumn(),
      drawerOpen: this.drawerOpen(),
      drawerTab: this.drawerTab(),
      rightTab: this.right(),
    };
    if (!this.state.frames.settled()) return;
    untracked(() => {
      if (JSON.stringify(this.state.frames.chrome()) !== JSON.stringify(snapshot)) this.state.frames.setChrome(snapshot);
    });
  });

  setDrawer(open: boolean): void {
    this.drawerOpen.set(open);
    this.column.set(open ? (untracked(this.#openColumn) ?? DRAWER_DEFAULT) : DRAWER_CLOSED);
  }

  toggleDrawer(): void {
    this.setDrawer(!this.drawerOpen());
  }

  /** Opens the drawer on a tab. */
  showDrawer(tab: string): void {
    this.drawerTab.set(tab);
    this.setDrawer(true);
  }

  toggleTheme(): void {
    this.theme.set(this.dark() ? "light" : "dark");
  }
}
