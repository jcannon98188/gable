import { instantiate, injectHost, setInput, type MountedComponent } from "./component.js";
import { INJECTOR, createInjector, inject } from "./di.js";
import { inputOf, input } from "./input.js";
import { createScope, currentScope, runInScope, type Scope } from "./scope.js";
import { computed, effect, untracked } from "./signals.js";
import { toHref } from "./router-config.js";
import { ActiveRoute, OUTLET_DEPTH, Router, type Level } from "./router-state.js";

/** Renders the routed component of its nesting level. One unnamed outlet per level: import it and write `<router-outlet>`. */
export class RouterOutlet {
  static meta = { selector: "router-outlet" };
  router = inject(Router);
  injector = inject(INJECTOR);
  depth = inject(OUTLET_DEPTH, { optional: true }) ?? 0;
  target = injectHost<unknown>();
  level = this.router.levelAt(this.depth);
  owner = currentScope();
  _render = this.#render();

  #render(): void {
    let shown: Level | undefined;
    let scope: Scope | null = null;
    let mounted: MountedComponent<object, unknown> | null = null;
    const teardown = () => {
      scope?.dispose();
      mounted?.destroy();
      if (shown) shown.instance = undefined;
      scope = mounted = null;
    };
    this.owner?.onDispose(teardown);
    effect(() => {
      const level = this.level();
      if (level === shown) return;
      untracked(() => {
        teardown();
        shown = level;
        if (!level) return;
        const injector = createInjector(
          [{ provide: ActiveRoute, useValue: level.active }, { provide: OUTLET_DEPTH, useValue: this.depth + 1 }, ...level.providers],
          this.injector,
        );
        const next = createScope(this.owner);
        scope = next;
        next.onDispose(() => injector.destroy());
        mounted = instantiate(level.component, {
          renderer: this.target.renderer,
          parent: this.target.host,
          injector,
          parentScope: next,
          inputs: level.active.params(),
          lenientInputs: true,
        });
        level.instance = mounted.instance;
        const instance = mounted.instance;
        // Later param changes reach the same instance through its inputs.
        runInScope(next, () =>
          effect(() => {
            const params = level.active.params();
            untracked(() => {
              for (const [name, value] of Object.entries(params)) if (inputOf(instance, name)) setInput(instance, name, value);
            });
          }),
        );
      });
    });
  }
}

interface ClickLike {
  button?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault?(): void;
}

/** The `href` each `[routerLink]` host currently points at, for `routerLinkActive` on the same element. */
const linkHrefs = new WeakMap<object, () => string>();

/** `<a routerLink="/users">` or `[routerLink]="['/users', id()]"`: sets `href` and navigates on a plain click. */
export class RouterLink {
  static meta = { selector: "[routerLink]", host: { "[attr.href]": "href()", "(click)": "onClick($event)" } };
  router = inject(Router);
  routerLink = input<string | readonly unknown[]>("");
  href = computed(() => toHref(this.routerLink()));
  _register = linkHrefs.set(injectHost<object>().host, this.href);

  onClick(event?: ClickLike): void {
    if (event && (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    event?.preventDefault?.();
    void this.router.navigate(this.href());
  }
}

/** `<a routerLink="/users" routerLinkActive="on">` adds the classes while the link's URL is active (a prefix match unless `routerLinkActiveExact`). */
export class RouterLinkActive {
  static meta = { selector: "[routerLinkActive]" };
  router = inject(Router);
  routerLinkActive = input<string>("");
  routerLinkActiveExact = input<boolean>(false);
  target = injectHost<object>();
  _apply = this.#apply();

  #apply(): void {
    const { renderer, host } = this.target;
    let applied: string[] = [];
    effect(() => {
      const href = linkHrefs.get(host)?.();
      const path = new URL(this.router.url() || "/", "http://gable.invalid").pathname;
      const link = href === undefined ? undefined : new URL(href, "http://gable.invalid").pathname;
      const active = link !== undefined && (path === link || (!this.routerLinkActiveExact() && (link === "/" || path.startsWith(link + "/"))));
      const wanted = active ? this.routerLinkActive().split(/\s+/).filter(Boolean) : [];
      for (const name of applied) if (!wanted.includes(name)) renderer.setClass(host, name, false);
      for (const name of wanted) renderer.setClass(host, name, true);
      applied = wanted;
    });
  }
}
