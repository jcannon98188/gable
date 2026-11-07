import { computed, effect, html, injectHost, signal, untracked, viewChild } from "@gable/core";
import { DemoSession, type Outcome } from "./session.js";
import { EDITS, INITIAL_SOURCE, diffLines, type DemoEdit, type DiffLine } from "./source.js";

const LABELS: Record<Outcome["status"], string> = {
  applied: "applied",
  unchanged: "unchanged",
  "rolled-back": "rolled back",
  reload: "reload needed",
  invalid: "rolled back",
};

/**
 * The live HMR demo. A real Gable component (the Counter in the source pane) is mounted with its own `bootstrap` into
 * the stage; Save evaluates the pane's text and hands it to the real `@gable/core/hmr` runtime, which swaps the class
 * in place and moves the state across. This module (and the runtime it pulls in) is a lazy chunk: the page only loads
 * it when the demo scrolls into view.
 */
export class HmrDemo {
  static meta = {
    selector: "site-hmr-demo",
    template: html`
<div class="win dm">
<div class="wbar"><i></i><i></i><i></i><span style="margin-left: 8px">counter.js &middot; edit it, then Save</span></div>
<div class="dm-body">
<div class="dm-col">
<div class="dm-cap mono">Live component</div>
<div class="dm-stage" #stage role="group" aria-label="The live Counter component"></div>
<div class="dm-cap mono">What the last save did</div>
<div class="dm-out" aria-live="polite">
@if (outcome()) {
<div class="dm-status" [class.ok]="healthy()" [class.bad]="!healthy()"><span class="dm-badge">{{ statusLabel() }}</span> {{ summary() }}</div>
@if (error()) {
<pre class="dm-err">{{ error() }}</pre>
}
<ul class="dm-fields">
@for (f of carried(); track f.name) {
<li><span class="dm-tag keep">{{ keepLabel() }}</span> <code>{{ f.name }}</code> = {{ f.value }}</li>
}
@for (f of rederived(); track f.name) {
<li><span class="dm-tag calc">re-derived</span> <code>{{ f.name }}</code> = {{ f.value }}</li>
}
@for (f of added(); track f.name) {
<li><span class="dm-tag new">new</span> <code>{{ f.name }}</code> = {{ f.value }}</li>
}
@for (f of dropped(); track f.name) {
<li><span class="dm-tag gone">dropped</span> <code>{{ f.name }}</code></li>
}
</ul>
} @else {
<p class="dm-empty">Nothing saved yet. Click +1 a few times, type a name, then pick an edit.</p>
}
</div>
</div>
<div class="dm-col">
<div class="dm-chips" role="group" aria-label="Suggested edits">
@for (edit of edits; track edit.id) {
<button type="button" class="dm-chip" [class.warn]="edit.breaks" (click)="applyEdit(edit)">{{ edit.label }}</button>
}
</div>
<p class="dm-hint">{{ hint() }}</p>
<label class="dm-cap mono" for="dm-src">Source (plain JavaScript, no compiler)</label>
<textarea id="dm-src" class="dm-src mono" spellcheck="false" autocomplete="off" autocapitalize="off" [attr.rows]="rows()" [value]="source()" (input)="onInput($event)" (keydown)="onKey($event)"></textarea>
@if (diff().length) {
<pre class="dm-diff" aria-label="What the last suggested edit changed">@for (line of diff(); track line.id) {<span [attr.class]="line.cls">{{ line.text }}</span>}</pre>
}
<div class="row dm-actions">
<button type="button" class="btn btn-a" (click)="save()">Save</button>
<button type="button" class="btn btn-o" [disabled]="!dirty()" (click)="restore()">Undo unsaved edit</button>
<button type="button" class="btn btn-o" (click)="reset()">Reset</button>
<span class="dm-key mono">Ctrl+Enter saves</span>
</div>
</div>
</div>
</div>
    `,
  };

  edits = EDITS;
  source = signal(INITIAL_SOURCE);
  /** The text the running component was last successfully built from. */
  applied = signal(INITIAL_SOURCE);
  outcome = signal<Outcome | null>(null);
  lastEdit = signal<DemoEdit | null>(null);
  notice = signal("");
  diffRaw = signal<DiffLine[]>([]);
  /** Bumped per edit so each diff is a fresh set of nodes (the flash animation replays). */
  editCount = signal(0);

  stage = viewChild<HTMLElement>("stage");

  dirty = computed(() => this.source() !== this.applied());
  rows = computed(() => Math.min(30, Math.max(14, this.source().split("\n").length + 1)));
  healthy = computed(() => {
    const status = this.outcome()?.status;
    return status === "applied" || status === "unchanged";
  });
  statusLabel = computed(() => {
    const o = this.outcome();
    return o ? LABELS[o.status] : "";
  });
  keepLabel = computed(() => (this.outcome()?.sameInstance && this.healthy() ? "untouched" : this.healthy() ? "carried over" : "still"));
  error = computed(() => this.outcome()?.error ?? "");
  carried = computed(() => this.outcome()?.carried ?? []);
  rederived = computed(() => this.outcome()?.rederived ?? []);
  added = computed(() => this.outcome()?.added ?? []);
  dropped = computed(() => this.outcome()?.dropped ?? []);
  diff = computed(() => this.diffRaw().map((line, i) => ({ id: this.editCount() * 1000 + i, cls: `dl ${line.kind}`, text: (line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  ") + line.text })));
  summary = computed(() => {
    const o = this.outcome();
    if (!o) return "";
    const kinds = o.changes.map((c) => c.kind).join(", ");
    const how = kinds ? ` The runtime classed the edit as: ${kinds}.` : "";
    switch (o.status) {
      case "applied":
        return (o.sameInstance ? "The view was rebuilt on the same instance; nothing was re-created." : "The class was set up again and the old instance's state moved across.") + how;
      case "unchanged":
        return "Nothing differed from the running code, so nothing changed.";
      case "reload":
        return "A real dev server would reload the page here.";
      case "invalid":
        return "The new source does not evaluate. Nothing was applied and the running component is untouched.";
      default:
        return "The new class failed to build. The update was undone and the running component is untouched.";
    }
  });
  hint = computed(() => this.notice() || this.lastEdit()?.hint || "Pick an edit: it patches the source and saves it in one go. Or edit the text yourself and press Save.");

  /** The page renderer: the demo mounts its live component with the same one, into its own root. */
  renderer = injectHost().renderer;
  session: DemoSession | null = null;

  private readonly mounted = effect(() => {
    const target = this.stage();
    if (!target) return;
    untracked(() => {
      this.session?.destroy();
      this.session = new DemoSession({ renderer: this.renderer, target });
      this.session.start();
    });
  });

  onInput(event: Event) {
    this.source.set((event.target as HTMLTextAreaElement).value);
  }

  onKey(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.save();
    }
  }

  /** Evaluates the source pane and applies it to the running component. */
  save() {
    const session = this.session;
    if (!session) return;
    this.notice.set("");
    const outcome = session.save(this.source());
    this.outcome.set(outcome);
    if (outcome.status === "applied" || outcome.status === "unchanged") this.applied.set(this.source());
  }

  /** Patches the source with a suggested edit, shows the diff, and saves. */
  applyEdit(edit: DemoEdit) {
    // After a failed save the pane holds broken text; suggested edits then start from the running source instead.
    const before = this.healthy() || !this.outcome() ? this.source() : this.applied();
    const next = edit.apply(before);
    if (next === null) {
      this.notice.set(`"${edit.label}" patches text that is not in the source any more. Undo your edit or Reset first.`);
      return;
    }
    this.lastEdit.set(edit);
    this.editCount.update((n) => n + 1);
    this.diffRaw.set(diffLines(before, next));
    this.source.set(next);
    this.save();
  }

  /** Puts back the text the running component was built from, without touching its state. */
  restore() {
    this.source.set(this.applied());
    this.diffRaw.set([]);
    this.notice.set("");
    this.lastEdit.set(null);
  }

  /** The original source and a fresh component: this is the one action that discards state. */
  reset() {
    this.session?.reset();
    this.source.set(INITIAL_SOURCE);
    this.applied.set(INITIAL_SOURCE);
    this.outcome.set(null);
    this.lastEdit.set(null);
    this.diffRaw.set([]);
    this.notice.set("");
  }
}
