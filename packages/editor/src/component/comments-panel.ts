import { computed, effect, html, input, signal } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import type { Editor } from "@tiptap/core";
import { getComments, type CommentThread } from "../plugins/comments.js";

interface Row {
  id: string;
  quote: string;
  orphaned: boolean;
  resolved: boolean;
  active: boolean;
  cardClass: string;
  messages: Array<{ id: string; name: string; color: string; text: string; time: string }>;
  draft: string;
  toggleLabel: string;
}

/**
 * `<gable-comments [editor]="editor"></gable-comments>`: the comment sidebar. Lists threads in document order, highlights
 * the active one, and offers reply, resolve and reopen. Needs an editor built with `commentsPlugin`.
 */
export class GableComments {
  static meta = {
    selector: "gable-comments",
    template: html`
      <section aria-label="Comments" class="flex flex-col gap-2 text-sm">
        @if (canStart()) {
          <form class="flex flex-col gap-1 rounded-md border p-2" (submit)="start($event)">
            <label class="text-xs font-medium" for="gable-new-comment">Comment on selection</label>
            <textarea id="gable-new-comment" class="rounded border bg-background p-1" rows="2" [value]="newText()" (input)="onNew($event)"></textarea>
            <button type="submit" class="self-end rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Comment</button>
          </form>
        }
        @for (r of visibleRows(); track r.id) {
          <article [attr.class]="r.cardClass" [attr.data-thread]="r.id" [attr.aria-current]="r.active" (click)="activate(r.id)">
            <p class="m-0 text-xs text-muted-foreground">
              @if (r.orphaned) {
                <span>Text removed: </span>
              }
              “{{ r.quote }}”
            </p>
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
              @for (m of r.messages; track m.id) {
                <li>
                  <span class="font-medium" [attr.style]="m.color">{{ m.name }}</span>
                  <time class="ml-1 text-xs text-muted-foreground">{{ m.time }}</time>
                  <div>{{ m.text }}</div>
                </li>
              }
            </ul>
            @if (!r.resolved) {
              <form class="flex gap-1" (submit)="reply($event, r.id)">
                <input class="min-w-0 flex-1 rounded border bg-background p-1" aria-label="Reply" placeholder="Reply" [value]="r.draft" (input)="setDraft(r.id, $event)" />
                <button type="submit" class="rounded border px-2 text-xs">Reply</button>
              </form>
            }
            <div class="flex justify-end">
              <button type="button" class="rounded border px-2 py-0.5 text-xs" (click)="toggle($event, r.id, r.resolved)">{{ r.toggleLabel }}</button>
            </div>
          </article>
        }
        @if (visibleRows().length === 0) {
          <p class="m-0 text-xs text-muted-foreground">No comments yet.</p>
        }
      </section>
    `,
  };

  editor = input<Editor | null>(null);
  /** Also list resolved threads. */
  showResolved = input<boolean>(false);

  private threads = signal<CommentThread[]>([]);
  private activeId = signal<string | null>(null);
  private drafts = signal<Record<string, string>>({});
  canStart = signal(false);
  newText = signal("");

  private rows = computed<Row[]>(() =>
    this.threads().map((t) => {
      const active = t.id === this.activeId();
      return {
        id: t.id,
        quote: t.quote,
        orphaned: !t.range,
        resolved: t.resolved,
        active,
        cardClass: `flex flex-col gap-1 rounded-md border p-2 ${active ? "border-amber-500 bg-amber-50 dark:bg-amber-950" : ""} ${t.resolved ? "opacity-60" : ""}`,
        messages: t.messages.map((m) => ({
          id: m.id,
          name: m.author.name,
          color: `color:${m.author.color}`,
          text: m.text,
          time: new Date(m.at).toLocaleString(),
        })),
        draft: this.drafts()[t.id] ?? "",
        toggleLabel: t.resolved ? "Reopen" : "Resolve",
      };
    }),
  );
  visibleRows = computed(() => this.rows().filter((r) => this.showResolved() || !r.resolved));

  private watch = (() => {
    let stop: (() => void) | null = null;
    effect(() => {
      const editor = this.editor();
      stop?.();
      stop = null;
      const api = editor && getComments(editor);
      if (!editor || !api) {
        this.threads.set([]);
        this.canStart.set(false);
        return;
      }
      const sync = () => {
        this.threads.set(api.threads());
        this.activeId.set(api.activeId);
        this.canStart.set(!editor.state.selection.empty && editor.isEditable);
      };
      const unsub = api.subscribe(sync);
      editor.on("selectionUpdate", sync);
      sync();
      stop = () => {
        unsub();
        editor.off("selectionUpdate", sync);
      };
    });
    currentScope()?.onDispose(() => stop?.());
  })();

  private api() {
    const editor = this.editor();
    return editor ? getComments(editor) : undefined;
  }

  onNew(event: Event): void {
    this.newText.set((event.target as HTMLTextAreaElement).value);
  }

  start(event: Event): void {
    event.preventDefault();
    if (this.api()?.start(this.newText())) this.newText.set("");
  }

  reply(event: Event, id: string): void {
    event.preventDefault();
    if (this.api()?.reply(id, this.drafts()[id] ?? "")) this.drafts.update((d) => ({ ...d, [id]: "" }));
  }

  setDraft(id: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.drafts.update((d) => ({ ...d, [id]: value }));
  }

  activate(id: string): void {
    this.api()?.setActive(id);
  }

  toggle(event: Event, id: string, resolved: boolean): void {
    event.stopPropagation();
    const api = this.api();
    if (resolved) api?.reopen(id);
    else api?.resolve(id);
  }
}
