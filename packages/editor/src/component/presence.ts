import { computed, effect, html, input, signal } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import type { Awareness } from "y-protocols/awareness";
import { watchPresence, type PresenceEntry } from "../yjs/awareness.js";

/**
 * `<gable-presence [awareness]="awareness" [max]="5"></gable-presence>`: who is in the document, as coloured initials.
 * The local user comes first. More than `max` collapses into a "+N" badge.
 */
export class GablePresence {
  static meta = {
    selector: "gable-presence",
    template: html`
      <ul class="m-0 flex list-none items-center gap-1 p-0" aria-label="People in this document">
        @for (u of shown(); track u.clientId) {
          <li
            class="inline-flex size-6 items-center justify-center rounded-full text-xs font-medium text-white"
            [attr.style]="u.style"
            [attr.title]="u.title"
          >
            <span aria-hidden="true">{{ u.initials }}</span>
            <span class="sr-only">{{ u.title }}</span>
          </li>
        }
        @if (extra() > 0) {
          <li class="inline-flex size-6 items-center justify-center rounded-full bg-muted text-xs">+{{ extra() }}<span class="sr-only"> more</span></li>
        }
      </ul>
    `,
  };

  awareness = input<Awareness | null>(null);
  max = input<number>(5);
  users = signal<PresenceEntry[]>([]);

  private rows = computed(() =>
    this.users().map((u) => ({
      clientId: u.clientId,
      initials: (u.name.trim()[0] ?? "?").toUpperCase(),
      title: u.isLocal ? `${u.name} (you)` : u.name,
      style: `background-color:${u.color}`,
    })),
  );
  shown = computed(() => this.rows().slice(0, this.max()));
  extra = computed(() => Math.max(0, this.rows().length - this.max()));

  private watch = (() => {
    let stop: (() => void) | null = null;
    effect(() => {
      const awareness = this.awareness();
      stop?.();
      stop = null;
      if (awareness) stop = watchPresence(awareness, (users) => this.users.set(users));
      else this.users.set([]);
    });
    currentScope()?.onDispose(() => stop?.());
  })();
}
