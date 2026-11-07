import { computed, html, input, signal } from "@gable/core";
// The tokenizer behind gable-ui's ui-code-block (pure, dependency-free). The component itself needs Tailwind and the
// shadcn theme, which the site does not use, so the site renders the tokens with its own markup and colours.
import { normalizeLanguage, tokenize } from "../../../packages/ui/src/lib/highlight.js";

interface Tok {
  key: number;
  text: string;
  cls: string;
}
interface Line {
  key: number;
  tokens: Tok[];
}

/** Highlighted code with a copy button. Tokens render as spans through the template, so code can never inject markup. */
export class DocCode {
  static meta = {
    selector: "doc-code",
    template: html`
<div class="cb">
<div class="cb-bar"><span class="cb-lang">{{ label() }}</span><button type="button" class="cb-copy" (click)="copy()" [attr.aria-label]="copyLabel()">{{ copyLabel() }}</button></div>
<pre class="cb-pre" tabindex="0" [attr.aria-label]="aria()"><code [attr.data-language]="lang()">@for (line of lines(); track line.key) {<span class="cb-line">@for (t of line.tokens; track t.key) {<span [attr.class]="t.cls">{{ t.text }}</span>}</span>}</code></pre>
<span class="sr-only" role="status" aria-live="polite">{{ status() }}</span>
</div>
    `,
  };

  code = input<string>("");
  language = input<string>("text");

  didCopy = signal(false);
  status = signal("");

  lang = computed(() => normalizeLanguage(this.language()));
  label = computed(() => (this.lang() === "text" ? this.language() || "text" : this.lang()));
  aria = computed(() => `${this.label()} code`);
  copyLabel = computed(() => (this.didCopy() ? "Copied" : "Copy"));

  lines = computed<Line[]>(() => {
    const raw = this.code();
    const source = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
    return tokenize(source, this.language()).map((tokens, key) => ({
      key,
      tokens: tokens.length ? tokens.map((t, k) => ({ key: k, text: t.text, cls: `tk-${t.kind}` })) : [{ key: 0, text: " ", cls: "" }],
    }));
  });

  copy(): void {
    const done = (ok: boolean) => {
      this.didCopy.set(ok);
      this.status.set(ok ? "Copied to clipboard" : "Could not copy");
      if (ok) setTimeout(() => (this.didCopy.set(false), this.status.set("")), 2000);
    };
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clip?.writeText) return done(false);
    clip.writeText(this.code()).then(
      () => done(true),
      () => done(false),
    );
  }
}
