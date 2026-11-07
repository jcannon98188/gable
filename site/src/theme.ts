import { computed, signal } from "@gable/core";

export type Theme = "dark" | "light";

const root = () => (typeof document === "undefined" ? undefined : document.documentElement);
const KEY = "gable-theme";

/**
 * The colour theme. `index.html` picks the first value before paint (saved choice, else the OS setting) and writes it to
 * `<html data-theme>`; this service mirrors it as a signal and keeps the attribute and localStorage in step.
 */
export class ThemeStore {
  static scope = "root";

  theme = signal<Theme>(root()?.dataset.theme === "light" ? "light" : "dark");

  label = computed(() => (this.theme() === "dark" ? "Switch to light theme" : "Switch to dark theme"));

  toggle() {
    this.set(this.theme() === "dark" ? "light" : "dark");
  }

  set(theme: Theme) {
    this.theme.set(theme);
    const el = root();
    if (el) el.dataset.theme = theme;
    try {
      globalThis.localStorage?.setItem(KEY, theme);
    } catch {
      // Storage can be blocked; the theme still applies for this visit.
    }
  }
}
