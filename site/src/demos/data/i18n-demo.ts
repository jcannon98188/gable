import { I18n, computed, html, inject, provideI18n, signal } from "@gable/core";
import { catalogs, locales, type DemoLocale } from "./catalogs.js";

/** Every id the template below marks, so the demo can list the ones the active catalog does not have. */
const MARKED = ["title", "unread", "reply", "stats", "balance", "saved"] as const;


/**
 * Runtime i18n with the real `I18n` service: the markers in the template (`i18n="@@id"`) resolve against the catalogs
 * on the right, and switching the locale re-renders plurals, selects, numbers and dates in place. The service is
 * provided on this component, so the demo does not touch the rest of the page.
 */
export class I18nDemo {
  static meta = {
    selector: "data-i18n-demo",
    providers: [...provideI18n({ sourceLocale: "en", catalogs }), I18n],
    template: html`
<div class="dd-panel">
  <div class="dd-bar" role="group" aria-label="Language">
    @for (l of locales; track l.code) {
      <button type="button" class="dd-seg" [attr.aria-pressed]="l.code === i18n.locale()" (click)="pick(l.code)">{{ l.label }}</button>
    }
  </div>

  <div class="dd-controls">
    <span class="dd-lbl" id="dd-unread-lbl">Unread</span>
    <button type="button" class="dd-mini" aria-label="One fewer unread message" (click)="dec()">-</button>
    <output class="dd-num" aria-labelledby="dd-unread-lbl">{{ unread() }}</output>
    <button type="button" class="dd-mini" aria-label="One more unread message" (click)="inc()">+</button>
    <label class="dd-lbl" for="dd-gender">Sender</label>
    <select id="dd-gender" class="dd-in dd-sel" (change)="onGender($event)">
      <option value="female">female</option>
      <option value="male">male</option>
      <option value="other">other</option>
    </select>
  </div>

  <div class="dd-out" [attr.dir]="dir()" [attr.lang]="i18n.locale()" aria-live="polite">
    <h4 class="dd-h4" i18n="@@title">Your inbox</h4>
    <p i18n="@@unread">{{ unread() }} unread messages</p>
    <p i18n="@@reply">{{ gender() }} replied to your thread</p>
    <p i18n="@@stats">{{ downloads() }} downloads since {{ since() }}</p>
    <p i18n="@@balance">Balance: {{ balance() }}</p>
    <p i18n="@@saved">Settings saved</p>
  </div>

  @if (missing().length > 0) {
    <p class="dd-note dd-warn">Missing in <span class="mono">{{ i18n.locale() }}</span>: <span class="mono">{{ missingText() }}</span>. The source text is shown instead.</p>
  }

  <details class="dd-det">
    <summary>Catalog for <span class="mono">{{ i18n.locale() }}</span></summary>
    <pre class="dd-pre" dir="ltr">{{ catalogJson() }}</pre>
  </details>

  <p class="dd-note">This is runtime i18n: one bundle, any locale switched live. A baked build (<span class="mono">gableI18n({ bake })</span>) ships one output per locale with the text inlined and no runtime, but cannot bake plural and select forms in templates.</p>
</div>
    `,
  };

  locales = locales;
  i18n = inject(I18n);

  unread = signal(3);
  gender = signal("female");
  downloads = signal(1234567);
  since = signal(new Date(Date.UTC(2024, 2, 14, 12)));
  balance = signal(1234.5);

  dir = computed(() => locales.find((l) => l.code === this.i18n.locale())?.dir ?? "ltr");
  catalog = computed(() => catalogs[this.i18n.locale() as DemoLocale] ?? {});
  catalogJson = computed(() => JSON.stringify(this.catalog(), null, 2));
  missing = computed(() => MARKED.filter((id) => !(id in this.catalog())));
  missingText = computed(() => this.missing().join(", "));

  pick(code: string) {
    void this.i18n.setLocale(code);
  }

  onGender(event: Event) {
    this.gender.set((event.target as HTMLSelectElement).value);
  }

  inc() {
    this.unread.update((n) => n + 1);
  }

  dec() {
    this.unread.update((n) => Math.max(0, n - 1));
  }
}
