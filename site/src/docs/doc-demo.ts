import { computed, createComponent, createInjector, effect, ErrorHandler, html, inject, input, RENDERER, signal, untracked, viewChild } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";
import { DocCode } from "./doc-code.js";
import { demoByName } from "./demos.js";

/**
 * A live demo from the registry (`demos.ts`), embedded in a docs page by a ```` ```demo <name> ```` fence.
 *
 * Isolation. Three layers, all from the framework, no shadow DOM and no iframe:
 *  - State: the demo is built with `createComponent` in a fresh root injector, as `bootstrap()` would. Nothing the page
 *    provides (router, docs state, stores) is visible to it; a demo that needs a service provides its own.
 *  - Styles: Gable scopes each component's `styles` to that component (an attribute token the renderer adds), so a
 *    demo's CSS cannot reach the page. The page's element-level rules can still reach in, which is deliberate: demos
 *    use the site's colour variables and look native. `.md` rules do not apply because the stage sits in its own box.
 *  - Failures: a load error, a setup error or a later runtime error (reported to the injector's `ErrorHandler`) turns
 *    only this frame into "This demo failed to load" with the error text and a Retry button. The page keeps working.
 * Each demo's code and source are separate chunks, fetched when the frame first mounts.
 */
export class DocDemo {
  static meta = {
    selector: "doc-demo",
    imports: [DocCode],
    styles: `
:host{display:block}
.fr{border:1px solid var(--line);border-radius:12px;background:var(--card);overflow:hidden;margin:0}
.fh{display:flex;flex-direction:column;gap:2px;padding:12px 16px;border-bottom:1px solid var(--line)}
.fh b{font-size:15px}
.fh span,.cap{font-size:13px;color:var(--mut)}
.cap{margin:0;padding:10px 16px 0}
.stage{padding:16px;min-width:0;overflow-x:auto}
.stage[hidden]{display:none}
.load{margin:0;padding:16px;font-size:14px;color:var(--mut)}
.bad{margin:16px;padding:12px 14px;border:1px solid var(--badline);background:var(--badbg);border-radius:8px;font-size:14px;color:var(--tx)}
.bad pre{margin:8px 0;white-space:pre-wrap;word-break:break-word;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.retry{min-height:36px;padding:0 14px;border-radius:8px;border:1px solid var(--line);background:var(--card2);color:var(--tx);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.retry:hover{border-color:var(--acc)}
details{border-top:1px solid var(--line)}
summary{padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;color:var(--mut)}
details .src{padding:0 12px 12px}
`,
    template: html`
<figure class="fr">
<figcaption class="fh"><b>{{ title() }}</b><span>{{ description() }}</span></figcaption>
@if (caption()) {
<p class="cap">{{ caption() }}</p>
}
<div class="stage" #stage [hidden]="failed()" role="group" [attr.aria-label]="title()"></div>
@if (loading()) {
<p class="load" role="status">Loading the demo</p>
}
@if (failed()) {
<div class="bad" role="alert"><b>This demo failed to load.</b><pre>{{ error() }}</pre><button type="button" class="retry" (click)="retry()">Retry</button></div>
}
@if (source()) {
<details><summary>Source</summary><div class="src"><doc-code [code]="source()" language="ts"></doc-code></div></details>
}
</figure>
    `,
  };

  /** The registry name. */
  name = input<string>("");
  /** Optional caption shown above the demo. */
  caption = input<string>("");

  private renderer = inject(RENDERER, { optional: true }) as Renderer<unknown> | null;
  private stage = viewChild<unknown>("stage");

  entry = computed(() => demoByName(this.name()));
  title = computed(() => this.entry()?.title ?? this.name());
  description = computed(() => this.entry()?.description ?? "");
  loading = signal(true);
  failed = signal(false);
  error = signal("");
  source = signal("");
  private attempt = signal(0);
  private generation = 0;
  private teardown: (() => void) | null = null;

  private readonly mounter = effect(() => {
    const stage = this.stage();
    const entry = this.entry();
    this.attempt();
    if (stage === undefined) return;
    // Deferred and untracked: the demo is built outside this effect, so its signals and scope are not ours.
    void Promise.resolve().then(() => untracked(() => this.mount(stage, entry)));
  });

  private readonly cleanup = currentScope()?.onDispose(() => this.destroyDemo());

  /** Tries again after a failure: reloads the chunk and rebuilds the demo from scratch. */
  retry(): void {
    this.attempt.update((n) => n + 1);
  }

  private destroyDemo(): void {
    this.generation++;
    const t = this.teardown;
    this.teardown = null;
    try {
      t?.();
    } catch {
      /* a demo that fails while being torn down must not break the page */
    }
  }

  private fail(error: unknown): void {
    this.error.set(error instanceof Error ? error.message || error.name : String(error));
    this.failed.set(true);
    this.loading.set(false);
  }

  private async mount(stage: unknown, entry: ReturnType<typeof demoByName>): Promise<void> {
    this.destroyDemo();
    const run = this.generation;
    this.loading.set(true);
    this.failed.set(false);
    this.error.set("");
    const renderer = this.renderer;
    if (!renderer) return this.fail(new Error("No renderer is available to mount the demo."));
    if (!entry) return this.fail(new Error(`No demo named "${this.name()}" is registered (site/src/docs/demos.ts).`));
    const current = () => run === this.generation;
    entry.source().then(
      (src) => current() && this.source.set(src),
      () => current() && this.source.set(""),
    );
    let host: unknown = null;
    let ref: { destroy(): void } | null = null;
    const discard = () => {
      try {
        ref?.destroy();
        if (host !== null) renderer.remove(host);
      } catch {
        /* discarding a broken demo */
      }
      ref = null;
      host = null;
    };
    try {
      const Component = await entry.load();
      if (!current()) return;
      // A runtime error after mount arrives here too, because this handler is the demo injector's ErrorHandler.
      const fail = (e: unknown) => this.fail(e);
      class Report extends ErrorHandler {
        override handleError(error: unknown): void {
          if (!current()) return;
          discard();
          fail(error);
        }
      }
      const injector = createInjector([{ provide: RENDERER, useValue: renderer }, ...(renderer.providers ?? []), { provide: ErrorHandler, useClass: Report }]);
      host = renderer.createElement("div", null);
      ref = createComponent(Component, { renderer, injector, host });
      renderer.insert(stage, host);
      this.teardown = discard;
      this.loading.set(false);
    } catch (error) {
      if (!current()) return;
      discard();
      this.fail(error);
    }
  }
}
