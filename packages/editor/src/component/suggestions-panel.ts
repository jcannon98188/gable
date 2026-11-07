import { computed, effect, html, input, signal } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import type { Editor } from "@tiptap/core";
import { getSuggestions, type Suggestion } from "../plugins/suggestions.js";

interface Row {
  id: string;
  label: string;
  text: string;
  author: string;
  color: string;
  time: string;
  cardClass: string;
  acceptLabel: string;
  rejectLabel: string;
}

/**
 * `<gable-suggestions [editor]="editor"></gable-suggestions>`: review pending suggestions. Toggle suggestion mode, then
 * accept or reject each suggestion, or all of them. Needs an editor built with `suggestionsPlugin`.
 */
export class GableSuggestions {
  static meta = {
    selector: "gable-suggestions",
    template: html`
      <section aria-label="Suggestions" class="flex flex-col gap-2 text-sm">
        <div class="flex items-center justify-between gap-2">
          <label class="flex items-center gap-1 text-xs">
            <input type="checkbox" [checked]="on()" (change)="toggleMode($event)" />
            Suggestion mode
          </label>
          @if (rows().length > 0) {
            <span class="flex gap-1">
              <button type="button" class="rounded border px-2 py-0.5 text-xs" (click)="acceptAll()">Accept all</button>
              <button type="button" class="rounded border px-2 py-0.5 text-xs" (click)="rejectAll()">Reject all</button>
            </span>
          }
        </div>
        @for (r of rows(); track r.id) {
          <article [attr.class]="r.cardClass" [attr.data-suggestion-id]="r.id">
            <p class="m-0">
              <span class="font-medium" [attr.style]="r.color">{{ r.author }}</span>
              <span class="text-xs text-muted-foreground">{{ r.label }}</span>
              <time class="ml-1 text-xs text-muted-foreground">{{ r.time }}</time>
            </p>
            <p class="m-0 break-words">“{{ r.text }}”</p>
            <div class="flex justify-end gap-1">
              <button type="button" class="rounded border px-2 py-0.5 text-xs" [attr.aria-label]="r.acceptLabel" (click)="accept(r.id)">Accept</button>
              <button type="button" class="rounded border px-2 py-0.5 text-xs" [attr.aria-label]="r.rejectLabel" (click)="reject(r.id)">Reject</button>
            </div>
          </article>
        }
        @if (rows().length === 0) {
          <p class="m-0 text-xs text-muted-foreground">No pending suggestions.</p>
        }
      </section>
    `,
  };

  editor = input<Editor | null>(null);

  private items = signal<Suggestion[]>([]);
  on = signal(false);
  rows = computed<Row[]>(() =>
    this.items().map((s) => ({
      id: s.id,
      acceptLabel: `Accept ${s.kind}: ${s.text}`,
      rejectLabel: `Reject ${s.kind}: ${s.text}`,
      label: s.kind === "insert" ? "inserted" : s.kind === "delete" ? "deleted" : (s.description ?? "formatted"),
      text: s.text,
      author: s.author.name,
      color: `color:${s.author.color}`,
      time: new Date(s.at).toLocaleString(),
      cardClass: "flex flex-col gap-1 rounded-md border p-2",
    })),
  );

  private watch = (() => {
    let stop: (() => void) | null = null;
    effect(() => {
      const editor = this.editor();
      stop?.();
      stop = null;
      const api = editor && getSuggestions(editor);
      if (!api) {
        this.items.set([]);
        this.on.set(false);
        return;
      }
      const sync = () => {
        this.items.set(api.list());
        this.on.set(api.mode());
      };
      stop = api.subscribe(sync);
      sync();
    });
    currentScope()?.onDispose(() => stop?.());
  })();

  private api() {
    const editor = this.editor();
    return editor ? getSuggestions(editor) : undefined;
  }

  toggleMode(event: Event): void {
    this.api()?.setMode((event.target as HTMLInputElement).checked);
  }
  accept(id: string): void {
    this.api()?.accept(id);
  }
  reject(id: string): void {
    this.api()?.reject(id);
  }
  acceptAll(): void {
    this.api()?.acceptAll();
  }
  rejectAll(): void {
    this.api()?.rejectAll();
  }
}
