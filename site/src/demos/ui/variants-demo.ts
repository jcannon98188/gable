import { computed, html, signal } from "@gable/core";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "../../../../packages/ui/src/components/button.js";
import { cn } from "../../../../packages/ui/src/lib/cn.js";
import { demoStyles } from "../signals/demo-style.js";

const VARIANTS: readonly ButtonVariant[] = ["default", "destructive", "outline", "secondary", "ghost", "link"];
const SIZES: readonly ButtonSize[] = ["default", "sm", "lg", "icon", "compact", "icon-compact"];

/**
 * The real `buttonVariants` and `cn` from @gable/ui. The components are styled with Tailwind utility classes and this site
 * does not load Tailwind, so the demo shows what the components compute (the class string) instead of painting a button
 * that would render unstyled. Pick a variant and size, add your own `class`, and see tailwind-merge resolve the conflicts.
 */
export class VariantsDemo {
  static meta = {
    selector: "variants-demo",
    styles: [
      demoStyles,
      `
.opts{display:flex;flex-wrap:wrap;gap:6px}
.opts .btn[aria-pressed=true]{background:var(--acc);color:var(--accfg);border-color:var(--acc)}
fieldset{border:0;margin:0;padding:0;min-width:0}
legend{font:500 11px 'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);padding:0 0 6px}
.chips{display:flex;flex-wrap:wrap;gap:5px;margin:0;padding:0;list-style:none}
.chips li{font:12px 'JetBrains Mono',ui-monospace,monospace;padding:2px 7px;border-radius:6px;background:var(--bg2);border:1px solid var(--line);overflow-wrap:anywhere}
.chips li.extra{border-color:var(--acc)}
.field{width:100%;box-sizing:border-box;min-height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--tx);font:13px 'JetBrains Mono',ui-monospace,monospace}
.field:focus-visible{outline:2px solid var(--acc);outline-offset:1px}
.out{margin:0;font:13px 'JetBrains Mono',ui-monospace,monospace;padding:8px 10px;border-radius:8px;background:var(--bg2);overflow-wrap:anywhere}
`,
    ],
    template: html`
<div class="demo">
<div class="dh">
<h3>Variants and cn</h3>
<p>The class string <code>uiButton</code> puts on a button, computed live by the real <code>buttonVariants</code>.</p>
</div>
<div class="db">
<fieldset>
<legend>variant</legend>
<div class="opts">
@for (v of variantRows(); track v.name) {
<button class="btn" type="button" [attr.aria-pressed]="v.on" (click)="pickVariant(v.name)">{{ v.name }}</button>
}
</div>
</fieldset>
<fieldset>
<legend>size</legend>
<div class="opts">
@for (s of sizeRows(); track s.name) {
<button class="btn" type="button" [attr.aria-pressed]="s.on" (click)="pickSize(s.name)">{{ s.name }}</button>
}
</div>
</fieldset>
<label class="note" for="vd-class">Your own <code>class</code> (it is merged last, so it wins conflicts)</label>
<input id="vd-class" class="field" type="text" [value]="extra()" (input)="edit($event)" />
<p class="note"><b>{{ count() }}</b> classes from <code>buttonVariants({ variant: "{{ variant() }}", size: "{{ size() }}", class: "{{ extra() }}" })</code></p>
<ul class="chips" aria-label="Generated classes">
@for (c of chips(); track c.text) {
<li [class.extra]="c.extra">{{ c.text }}</li>
}
</ul>
<p class="note"><code>cn(...)</code> on the same pieces: with a conflicting class such as <code>h-12</code> or <code>bg-red-500</code>, tailwind-merge drops the default it replaces.</p>
<p class="out" aria-live="polite">cn("px-2 py-1", "px-4", "{{ extra() }}") = {{ merged() }}</p>
</div>
</div>
    `,
  };

  variant = signal<ButtonVariant>("default");
  size = signal<ButtonSize>("default");
  extra = signal("h-12 bg-red-500");

  variantRows = computed(() => VARIANTS.map((name) => ({ name, on: name === this.variant() })));
  sizeRows = computed(() => SIZES.map((name) => ({ name, on: name === this.size() })));
  classes = computed(() => buttonVariants({ variant: this.variant(), size: this.size(), class: this.extra() }));
  count = computed(() => this.classes().split(/\s+/).filter(Boolean).length);
  chips = computed(() => {
    const own = new Set(this.extra().split(/\s+/).filter(Boolean));
    return this.classes()
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({ text, extra: own.has(text) }));
  });
  merged = computed(() => cn("px-2 py-1", "px-4", this.extra()));

  pickVariant(name: string) {
    this.variant.set(name as ButtonVariant);
  }
  pickSize(name: string) {
    this.size.set(name as ButtonSize);
  }
  edit(event: Event) {
    this.extra.set((event.target as HTMLInputElement).value);
  }
}
