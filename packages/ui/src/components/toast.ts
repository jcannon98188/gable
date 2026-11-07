import { computed, html, I18n, inject, input, signal } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import { LiveAnnouncer } from "@gable/core/renderer";
import { UiDrawerDrag, UiPortal, UiPresence } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";

/** The kind of a toast: it picks the icon, and errors are announced to screen readers assertively (the rest politely). `loading` toasts never time out. */
export type ToastType = "default" | "success" | "error" | "info" | "warning" | "loading";
/** Where `ui-toaster` stacks its toasts on screen. */
export type ToastPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

/** A button on a toast (for example Undo or Retry). */
export interface ToastAction {
  label: string;
  /** Runs when the button is pressed; the toast is dismissed afterwards. */
  onClick?: () => void;
}

/** Options for the `ToastService` methods (`show`, `success`, `error`, ...). Every field is optional. */
export interface ToastOptions {
  /** Reuse an id to update a toast in place instead of adding another. */
  id?: string;
  description?: string;
  /** Milliseconds before it closes itself. 0 or Infinity keeps it until dismissed. Default 4000 (loading toasts never time out). */
  duration?: number;
  action?: ToastAction;
  /** Show the close button. Default true. */
  dismissible?: boolean;
  /** Called when the toast is removed, by the user, a timeout or `dismiss()`. */
  onDismiss?: (id: string) => void;
}

/** A toast as `ToastService` stores and `ui-toaster` renders it: the options with defaults filled in. Read-only; change a toast by calling the service again with the same `id`. */
export interface ToastItem {
  readonly id: string;
  readonly type: ToastType;
  readonly message: string;
  readonly description: string;
  readonly duration: number;
  readonly action: ToastAction | null;
  readonly dismissible: boolean;
  readonly onDismiss: ((id: string) => void) | null;
}

/** The messages `ToastService.promise` shows while a promise is pending, when it resolves and when it rejects. `success` and `error` can be functions of the result. */
export interface ToastPromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((error: unknown) => string);
}

const DEFAULT_DURATION = 4000;

interface Timer {
  handle: ReturnType<typeof setTimeout> | undefined;
  remaining: number;
  started: number;
}

/**
 * The toast API. One instance per app (root scoped): inject it anywhere and call it; a `<ui-toaster>` somewhere in
 * the app renders what it holds.
 *
 *   toast = inject(ToastService);
 *   this.toast.success("Saved", { description: "Your changes are live." });
 *   this.toast.error("Upload failed", { action: { label: "Retry", onClick: () => this.upload() } });
 *   this.toast.promise(save(), { loading: "Saving...", success: "Saved", error: "Could not save" });
 *
 * Every toast is announced to screen readers through `LiveAnnouncer` (errors assertively). Timers are paused while
 * the toaster is hovered or focused (`pause()` / `resume()`).
 */
export class ToastService {
  static scope = "root";

  /** The open toasts, oldest first. */
  toasts = signal<readonly ToastItem[]>([]);

  private announcer = inject(LiveAnnouncer, { optional: true });
  private timers = new Map<string, Timer>();
  private paused = false;
  private seq = 0;
  private cleanup = currentScope()?.onDispose(() => {
    for (const timer of this.timers.values()) clearTimeout(timer.handle);
    this.timers.clear();
  });

  /** Shows a toast and returns its id. */
  show(message: string, options: ToastOptions & { type?: ToastType } = {}): string {
    const id = options.id ?? `toast-${++this.seq}`;
    const type = options.type ?? "default";
    const item: ToastItem = {
      id,
      type,
      message,
      description: options.description ?? "",
      duration: type === "loading" ? Infinity : (options.duration ?? DEFAULT_DURATION),
      action: options.action ?? null,
      dismissible: options.dismissible ?? true,
      onDismiss: options.onDismiss ?? null,
    };
    const exists = this.toasts().some((t) => t.id === id);
    this.toasts.update((list) => (exists ? list.map((t) => (t.id === id ? item : t)) : [...list, item]));
    this.cancel(id);
    this.arm(id, item.duration);
    this.announcer?.announce(item.description ? `${message}. ${item.description}` : message, type === "error" ? "assertive" : "polite");
    return id;
  }

  success(message: string, options?: ToastOptions): string {
    return this.show(message, { ...options, type: "success" });
  }
  error(message: string, options?: ToastOptions): string {
    return this.show(message, { ...options, type: "error" });
  }
  info(message: string, options?: ToastOptions): string {
    return this.show(message, { ...options, type: "info" });
  }
  warning(message: string, options?: ToastOptions): string {
    return this.show(message, { ...options, type: "warning" });
  }
  loading(message: string, options?: ToastOptions): string {
    return this.show(message, { ...options, type: "loading" });
  }

  /** A loading toast that turns into a success or error toast when `promise` settles. Returns the promise unchanged. */
  promise<T>(promise: Promise<T>, messages: ToastPromiseMessages<T>, options: ToastOptions = {}): Promise<T> {
    const id = this.loading(messages.loading, options);
    const settled = { ...options, id };
    promise.then(
      (value) => this.success(typeof messages.success === "function" ? messages.success(value) : messages.success, settled),
      (error) => this.error(typeof messages.error === "function" ? messages.error(error) : messages.error, settled),
    );
    return promise;
  }

  /** Closes one toast, or all of them without an id. */
  dismiss(id?: string): void {
    const gone = this.toasts().filter((t) => id === undefined || t.id === id);
    if (gone.length === 0) return;
    for (const t of gone) this.cancel(t.id);
    this.toasts.update((list) => list.filter((t) => !gone.includes(t)));
    for (const t of gone) t.onDismiss?.(t.id);
  }

  /** Stops every timer (the toaster calls this on hover and focus). */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    const now = Date.now();
    for (const timer of this.timers.values()) {
      if (timer.handle === undefined) continue;
      clearTimeout(timer.handle);
      timer.handle = undefined;
      timer.remaining = Math.max(0, timer.remaining - (now - timer.started));
    }
  }

  /** Restarts the timers with the time each toast had left. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const [id, timer] of this.timers) this.start(id, timer);
  }

  private arm(id: string, duration: number): void {
    if (!Number.isFinite(duration) || duration <= 0) return;
    const timer: Timer = { handle: undefined, remaining: duration, started: 0 };
    this.timers.set(id, timer);
    if (!this.paused) this.start(id, timer);
  }

  private start(id: string, timer: Timer): void {
    timer.started = Date.now();
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }

  private cancel(id: string): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer.handle);
    this.timers.delete(id);
  }
}

const POSITIONS: Record<ToastPosition, string> = {
  "top-left": "top-0 left-0 items-start",
  "top-center": "top-0 left-1/2 -translate-x-1/2 items-center",
  "top-right": "top-0 right-0 items-end",
  "bottom-left": "bottom-0 left-0 items-start",
  "bottom-center": "bottom-0 left-1/2 -translate-x-1/2 items-center",
  "bottom-right": "bottom-0 right-0 items-end",
};

const ICON: Record<ToastType, string> = { default: "", success: "check", error: "circle-alert", info: "circle", warning: "circle-alert", loading: "" };
const ICON_CLASS: Record<ToastType, string> = {
  default: "",
  success: "text-success",
  error: "text-destructive",
  info: "text-info",
  warning: "text-warning",
  loading: "",
};

let regionCounter = 0;
/** Pixels each older toast is shifted, and the scale it loses, per step behind the front; how many steps show. */
const STACK_OFFSET = 10;
const STACK_SCALE = 0.05;
const STACK_VISIBLE = 3;

/** True when a keydown matches a spec like `alt+t` or `ctrl+shift+k` (modifiers must match exactly; the key is compared by physical letter key or `key`). */
export function matchesHotkey(event: { key?: string; code?: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }, spec: string): boolean {
  const parts = spec.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
  const key = parts.pop();
  if (!key) return false;
  const want = (m: string) => parts.includes(m);
  if (want("alt") !== !!event.altKey || want("shift") !== !!event.shiftKey || want("meta") !== !!event.metaKey || want("ctrl") !== !!event.ctrlKey) return false;
  // Alt changes `key` on some layouts (macOS types a symbol), so letters and digits go by the physical key.
  const code = (event.code ?? "").toLowerCase();
  return code === `key${key}` || code === `digit${key}` || (event.key ?? "").toLowerCase() === key;
}

/**
 * The region that shows toasts. Put one `<ui-toaster></ui-toaster>` in the app (usually the root component); it renders
 * in the overlay root, so it is not clipped by ancestors. Toasts enter and leave with `data-state` animations (turned
 * off under `prefers-reduced-motion`) and stay mounted until the exit has played.
 *
 *   <ui-toaster position="bottom-right" [limit]="3"></ui-toaster>
 *
 * Hovering or focusing the region pauses the timers of every toast and opens the stack. Collapsed (the default `stack`), the newest toast
 * is in front and up to two older ones peek out behind it, scaled down and offset; the rest are hidden and not focusable. Opened, the
 * toasts are a list again. `limit` caps how many are shown at once (the oldest are queued, not dismissed, and counted in a "+N more"
 * line). The stack transitions are off under `prefers-reduced-motion`. A toast can be swiped away with a finger, pen or mouse
 * (toward the nearest screen edge; it uses the same drag engine as the drawer). `hotkey` (default `alt+t`, `""` turns it off) moves
 * focus to the region from anywhere on the page, which also pauses the timers; Tab then reaches each toast's buttons.
 */
export class UiToaster {
  static meta = {
    selector: "ui-toaster",
    imports: [UiPortal, UiPresence, UiIcon, UiDrawerDrag],
    template: html`
      <ui-portal>
        <section
          aria-label="Notifications"
          [attr.id]="regionId"
          tabindex="-1"
          [attr.class]="regionClasses()"
          [attr.data-expanded]="expandedAttr()"
          (mouseenter)="hover(true)"
          (mouseleave)="hover(false)"
          (focusin)="focus(true)"
          (focusout)="blur($event)"
        >
          <ol [attr.class]="listClasses()" data-toaster-list>
            @for (t of rows(); track t.id) {
              <li uiPresence uiDrawerDrag [side]="swipeSide()" (dismiss)="close(t.id)" [attr.data-type]="t.type" [attr.data-stack]="t.stack" [attr.style]="t.style" [attr.inert]="t.inert" class="pointer-events-auto transition-[transform,opacity] duration-200 motion-reduce:transition-none data-[stack=back]:pointer-events-none data-[stack=back]:overflow-hidden data-[stack=back]:[contain:size] touch-pan-y data-[dragged]:data-[state=closed]:animate-none data-[dragging]:select-none flex w-full items-start gap-3 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-8 motion-reduce:animate-none">
                @if (t.spinner) {
                  <span class="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground motion-reduce:animate-none" aria-hidden="true"></span>
                }
                @if (t.icon) {
                  <svg [uiIcon]="t.icon" [class]="t.iconClass"></svg>
                }
                <div class="grid flex-1 gap-1">
                  <div class="font-medium">{{ t.message }}</div>
                  @if (t.description) {
                    <div class="text-muted-foreground">{{ t.description }}</div>
                  }
                </div>
                @if (t.action) {
                  <button
                    type="button"
                    class="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    (click)="act(t.id)"
                  >{{ t.actionLabel }}</button>
                }
                @if (t.dismissible) {
                  <button
                    type="button"
                    aria-label="Close notification"
                    class="shrink-0 rounded-xs opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                    (click)="close(t.id)"
                  >
                    <svg uiIcon="x" class="size-4"></svg>
                  </button>
                }
              </li>
            }
          </ol>
          @if (hiddenCount()) {
            <div data-toaster-more class="pointer-events-auto mt-1 rounded-md bg-popover px-2 py-0.5 text-xs text-muted-foreground shadow-xs">{{ moreText() }}</div>
          }
        </section>
      </ui-portal>
    `,
  };

  position = input<ToastPosition>("bottom-right");
  /** The most toasts shown at once (when expanded). Older ones stay queued behind them and are counted in a "+N more" line. */
  limit = input<number>(5);
  /**
   * Stack the toasts: collapsed, the newest is in front and older ones peek out behind it, scaled down and offset; hovering or
   * focusing the region expands them into a list. `false` always shows the plain list.
   */
  stack = input<boolean>(true);
  /** Keyboard shortcut that focuses the region, like `alt+t` or `ctrl+shift+k`. Empty turns it off. */
  hotkey = input<string>("alt+t");
  class = input<string>("");

  regionId = `ui-toaster-${++regionCounter}`;
  /** Toasts are swiped toward the nearest side edge. */
  swipeSide = computed(() => (this.position().endsWith("left") ? "left" : "right"));

  service = inject(ToastService);
  private i18n = inject(I18n);
  private hovered = signal(false);
  private focused = signal(false);
  /** The stack is open: the pointer is over the region or focus is inside it. */
  expanded = computed(() => this.hovered() || this.focused());
  expandedAttr = computed(() => (this.expanded() ? "true" : null));
  private collapsed = computed(() => this.stack() && !this.expanded() && this.shown().length > 1);
  private shown = computed(() => this.service.toasts().slice(-Math.max(1, this.limit())));
  /** How many open toasts are queued beyond `limit`. */
  hiddenCount = computed(() => this.service.toasts().length - this.shown().length);
  moreText = computed(() => this.i18n.t`:hidden toast count@@ui.toast.more:+${this.hiddenCount()} more`);
  listClasses = computed(() => (this.collapsed() ? "pointer-events-auto grid w-full [&>li]:col-start-1 [&>li]:row-start-1" : "pointer-events-auto flex w-full flex-col gap-2"));

  regionClasses = computed(() => cn("pointer-events-none fixed z-[100] flex w-full max-w-sm flex-col gap-2 p-4 outline-none", POSITIONS[this.position()], this.class()));
  rows = computed(() => {
    const shown = this.shown();
    const collapsed = this.collapsed();
    const top = this.position().startsWith("top");
    return shown.map((t, i) => {
      const depth = shown.length - 1 - i;
      const style = collapsed
        ? `transform: translateY(${(top ? 1 : -1) * depth * STACK_OFFSET}px) scale(${1 - depth * STACK_SCALE}); transform-origin: ${top ? "top" : "bottom"} center; z-index: ${shown.length - depth}; opacity: ${depth >= STACK_VISIBLE ? 0 : 1};`
        : null;
      return {
        ...t,
        spinner: t.type === "loading",
        icon: ICON[t.type],
        iconClass: cn("mt-0.5 size-4", ICON_CLASS[t.type]),
        actionLabel: t.action?.label ?? "",
        stack: collapsed ? (depth === 0 ? "front" : "back") : "open",
        style,
        // Collapsed, only the front toast is reachable; the others leave the tab order until the stack opens.
        inert: collapsed && depth > 0 ? "" : null,
      };
    });
  });

  private bindHotkey = (() => {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc?.addEventListener) return;
    const handler = (event: KeyboardEvent) => this.onHotkey(event);
    doc.addEventListener("keydown", handler);
    currentScope()?.onDispose(() => doc.removeEventListener("keydown", handler));
  })();

  onHotkey(event: KeyboardEvent): void {
    const spec = this.hotkey();
    if (!spec || event.defaultPrevented || !matchesHotkey(event, spec)) return;
    const region = (globalThis as { document?: Document }).document?.getElementById(this.regionId);
    if (!region) return;
    event.preventDefault();
    region.focus();
  }

  hover(on: boolean): void {
    this.hovered.set(on);
    this.sync();
  }
  focus(on: boolean): void {
    this.focused.set(on);
    this.sync();
  }
  blur(event: { currentTarget?: unknown; relatedTarget?: unknown }): void {
    const region = event.currentTarget as { contains?(node: unknown): boolean } | null;
    if (event.relatedTarget && region?.contains?.(event.relatedTarget)) return;
    this.focus(false);
  }
  act(id: string): void {
    this.service.toasts().find((t) => t.id === id)?.action?.onClick?.();
    this.service.dismiss(id);
  }
  close(id: string): void {
    this.service.dismiss(id);
  }
  private sync(): void {
    if (this.expanded()) this.service.pause();
    else this.service.resume();
  }
}
