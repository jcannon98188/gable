import { html, signal, computed, effect, untracked, inject, createComponent, createInjector, InjectionToken, ErrorHandler, injectHost, viewChild } from "@gable/core";
import type { ComponentClass, ComponentRef } from "@gable/core";
import { parseExpression } from "@gable/core/tooling";
import { demoStyles } from "./demo-style.js";

/** The sample component the visitor's expression is evaluated against. */
export class Sample {
  count = signal(3);
  user = { name: "Ada", admin: true, email: null as string | null };
  title = "Gable";
  ready = true;
  doubled = computed(() => this.count() * 2);
  role = computed(() => (this.user.admin ? "Admin" : "Guest"));
  isThree = computed(() => this.count() === 3);
  label = computed(() => `Count is ${this.count()}`);
}

const SAMPLE = new InjectionToken<Sample>("ExpressionSample");

/** What the template sees: the sample's members, read through the real expression interpreter. */
class ProbeBase {
  private sample = inject(SAMPLE);
  count = this.sample.count;
  user = this.sample.user;
  title = this.sample.title;
  ready = this.sample.ready;
  doubled = this.sample.doubled;
  role = this.sample.role;
  isThree = this.sample.isThree;
  label = this.sample.label;
}

/** A component whose whole template is `{{ <the visitor's text> }}`, built at runtime and rendered by the real renderer. */
function probeFor(source: string): ComponentClass<object> {
  const text = `<span>{{ ${source} }}</span>`;
  const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
  return class ExpressionProbe extends ProbeBase {
    static meta = { selector: "expression-probe", template: { strings, values: [] } };
  };
}

type Parsed = { ok: true; kind: string } | { ok: false; message: string };

/** Parses with Gable's own parser (`parseExpression` from `@gable/core/tooling`), the one templates use. */
export function check(source: string): Parsed {
  if (source.trim() === "") return { ok: false, message: "Type an expression, or pick an example." };
  if (/[{}\n]/.test(source)) return { ok: false, message: "This demo wraps your text in {{ }} to render it, so braces and newlines are left out." };
  try {
    return { ok: true, kind: parseExpression(source).type };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

const ALLOWED = ["count()", "user.name", 'user.email ?? "no email"', "count() >= 3 && user.admin", "!ready", "doubled()"];
const REJECTED: readonly { source: string; fix: string; why: string }[] = [
  { source: 'user.admin ? "Admin" : "Guest"', fix: "role()", why: "ternary" },
  { source: "count() * 2", fix: "doubled()", why: "arithmetic" },
  { source: "format(count())", fix: "label()", why: "call with an argument" },
  { source: "count() == 3", fix: "count() === 3", why: "loose equality" },
];

export class ExpressionsDemo {
  static meta = {
    selector: "expressions-demo",
    styles: [
      demoStyles,
      `
.expr{box-sizing:border-box;width:100%;min-height:42px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font:14px 'JetBrains Mono',ui-monospace,monospace}
label{font-size:13px;color:var(--mut)}
.sample{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:10px 12px;border-radius:8px;background:var(--bg2);font-size:13px}
.sample code{color:var(--tx)}
.res{padding:12px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);display:flex;flex-direction:column;gap:8px;min-height:64px;font-size:14px}
.res.bad{border-color:var(--badline);background:var(--badbg)}
.res p{margin:0}
.out{font:600 15px 'JetBrains Mono',ui-monospace,monospace;overflow-wrap:anywhere}
.msg{font:13px/1.5 'JetBrains Mono',ui-monospace,monospace;overflow-wrap:anywhere}
.ex{display:flex;flex-wrap:wrap;gap:8px}
.h{font:500 11px 'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin:0}
`,
    ],
    template: html`
<div class="demo">
<div class="dh">
<h3>Simple template expressions, checked live</h3>
<p>Your text goes through Gable's real expression parser and is rendered by the real runtime against a sample component.</p>
</div>
<div class="db">
<div class="sample">
<span>Sample: <code>count</code> (signal), <code>user</code>, <code>title</code>, <code>ready</code>, computed <code>doubled</code> <code>role</code> <code>isThree</code> <code>label</code></span>
<span class="row"><button class="btn" type="button" aria-label="Decrease count" (click)="dec()">-</button><code>count = {{ sample.count() }}</code><button class="btn" type="button" aria-label="Increase count" (click)="inc()">+</button></span>
</div>
<div>
<label for="expr">Template expression</label>
<input id="expr" class="expr" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" [value]="source()" (input)="edit($event)">
</div>
<div class="res" [class.bad]="!parsed().ok" aria-live="polite">
@if (parsed().ok) {
<p>Parsed as <code>{{ kind() }}</code>. Rendered result:</p>
} @else {
<p class="msg" role="alert">{{ message() }}</p>
@if (fix()) {
<p>Use instead: <button class="btn code good" type="button" (click)="use(fix())">{{ fix() }}</button></p>
}
}
<div class="out" #out [hidden]="!parsed().ok"></div>
@if (runtimeError()) {
<p class="msg" role="alert">Runtime error: {{ runtimeError() }}</p>
}
</div>
<p class="h">Allowed, try one</p>
<div class="ex">
@for (src of allowed; track src) {
<button class="btn code good" type="button" (click)="use(src)">{{ src }}</button>
}
</div>
<p class="h">Rejected, see the parser's answer</p>
<div class="ex">
@for (r of rejected; track r.source) {
<button class="btn code rej" type="button" (click)="use(r.source)">{{ r.source }}</button>
}
</div>
<p class="note">The rejection text is the parser's own. The "use instead" buttons are hand-picked rewrites for these four examples; the rewrites themselves run through the real runtime.</p>
</div>
</div>
    `,
  };

  sample = new Sample();
  allowed = ALLOWED;
  rejected = REJECTED;
  source = signal("count() >= 3 && user.admin");
  parsed = computed(() => check(this.source()));
  kind = computed(() => {
    const p = this.parsed();
    return p.ok ? p.kind : "";
  });
  message = computed(() => {
    const p = this.parsed();
    return p.ok ? "" : p.message;
  });
  fix = computed(() => REJECTED.find((r) => r.source === this.source().trim())?.fix ?? "");
  runtimeError = signal("");
  out = viewChild<unknown>("out");

  private renderer = injectHost<unknown>().renderer;
  private probe: ComponentRef<object, unknown> | null = null;
  private handler = {
    handleError: (error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      queueMicrotask(() => this.runtimeError.set(text));
    },
  };

  private build = effect(() => {
    const out = this.out();
    const source = this.source();
    const parsed = this.parsed();
    untracked(() => this.rebuild(out, source, parsed));
  });

  edit(event: Event) {
    this.source.set((event.target as HTMLInputElement).value);
  }

  use(source: string) {
    this.source.set(source);
  }

  inc() {
    this.sample.count.update((n) => n + 1);
  }

  dec() {
    this.sample.count.update((n) => n - 1);
  }

  private rebuild(out: unknown, source: string, parsed: Parsed) {
    this.probe?.destroy();
    this.probe = null;
    this.runtimeError.set("");
    if (!out || !parsed.ok) return;
    try {
      this.probe = createComponent(probeFor(source.trim()), {
        renderer: this.renderer,
        parent: out,
        injector: createInjector([
          { provide: SAMPLE, useValue: this.sample },
          { provide: ErrorHandler, useValue: this.handler },
        ]),
      });
    } catch (error) {
      this.runtimeError.set(error instanceof Error ? error.message : String(error));
    }
  }
}
