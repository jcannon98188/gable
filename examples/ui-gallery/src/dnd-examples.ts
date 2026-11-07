import { computed, html, signal } from '@gable/core';
import { UiDraggable, UiDropZone, type DropEvent, type SortableMove } from '@gable/ui-primitives';
import { UiBadge, UiCard, UiCardContent, UiCardHeader, UiCardTitle, UiSortableList, type SortableRow } from '@gable/ui';

const row = (id: string, label: string, description?: string): SortableRow => ({ id, label, description });

/**
 * Drag and drop: a sortable list, a kanban board (three lists sharing a group) and a draggable with a drop zone.
 * Pointer: press and move (use the grip on touch screens). Keyboard: focus a card, space lifts, arrows move
 * (Left and Right change column), space drops, escape cancels. Open `/dnd.html` in the dev server.
 */
export class DndExamples {
  static meta = {
    selector: 'app-root',
    imports: [UiSortableList, UiCard, UiCardHeader, UiCardTitle, UiCardContent, UiBadge, UiDraggable, UiDropZone],
    template: html`
      <main class="mx-auto flex max-w-4xl flex-col gap-10 p-8">
        <header>
          <h1 class="text-2xl font-semibold tracking-tight">Drag and drop</h1>
          <p class="text-sm text-muted-foreground">Pointer or keyboard: focus a row, press space to lift, arrow keys to move, space to drop, escape to cancel.</p>
        </header>

        <section class="flex max-w-sm flex-col gap-3">
          <h2 class="text-lg font-medium">Sortable list</h2>
          <ui-sortable name="playlist" label="Playlist" [handle]="true" [(items)]="playlist"></ui-sortable>
          <p class="text-sm text-muted-foreground">Order: {{ playlistOrder() }}</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Kanban</h2>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div uiCard class="gap-3 py-4">
              <div uiCardHeader><h3 uiCardTitle>To do <span uiBadge variant="secondary">{{ todoCount() }}</span></h3></div>
              <div uiCardContent class="px-3">
                <ui-sortable name="todo" group="board" label="To do" [(items)]="todo" (moved)="record($event)"></ui-sortable>
              </div>
            </div>
            <div uiCard class="gap-3 py-4">
              <div uiCardHeader><h3 uiCardTitle>Doing <span uiBadge variant="secondary">{{ doingCount() }}</span></h3></div>
              <div uiCardContent class="px-3">
                <ui-sortable name="doing" group="board" label="Doing" [(items)]="doing" (moved)="record($event)"></ui-sortable>
              </div>
            </div>
            <div uiCard class="gap-3 py-4">
              <div uiCardHeader><h3 uiCardTitle>Done <span uiBadge variant="secondary">{{ doneCount() }}</span></h3></div>
              <div uiCardContent class="px-3">
                <ui-sortable name="done" group="board" label="Done" [(items)]="done" (moved)="record($event)"></ui-sortable>
              </div>
            </div>
          </div>
          <p class="text-sm text-muted-foreground">Last move: {{ lastMove() }}</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Draggable and drop zone</h2>
          <div class="flex items-center gap-6">
            <div [uiDraggable]="payload" dragGroup="trash" dragLabel="Sticky note" class="cursor-grab rounded-md border bg-card px-4 py-3 shadow-xs outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[dragging]:opacity-40">Sticky note</div>
            <div uiDropZone dropGroup="trash" dropLabel="Trash" (dropped)="trashed($event)" class="flex h-24 w-40 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground data-[drop-over]:border-destructive data-[drop-over]:bg-destructive/10">Drop here</div>
          </div>
          <p class="text-sm text-muted-foreground">Dropped in the trash: {{ trash() }} time(s)</p>
        </section>
      </main>
    `,
  };

  playlist = signal([row('p1', 'Intro', '0:45'), row('p2', 'Verse one', '1:30'), row('p3', 'Chorus', '1:05'), row('p4', 'Outro', '0:30')]);
  playlistOrder = computed(() => this.playlist().map((r) => r.label).join(' > '));

  todo = signal([row('k1', 'Write the docs'), row('k2', 'Fix flaky test', 'CI only'), row('k3', 'Review PR')]);
  doing = signal([row('k4', 'Ship the router')]);
  done = signal([row('k5', 'Set up repo')]);
  todoCount = computed(() => this.todo().length);
  doingCount = computed(() => this.doing().length);
  doneCount = computed(() => this.done().length);
  lastMove = signal('none');
  record(move: SortableMove<SortableRow>) {
    this.lastMove.set(`${move.data.label}: ${move.from.container ?? '-'} #${(move.from.index ?? 0) + 1} -> ${move.to.container} #${move.to.index + 1}`);
  }

  payload = { kind: 'note' };
  trash = signal(0);
  trashed(_event: DropEvent) {
    this.trash.update((n) => n + 1);
  }
}
