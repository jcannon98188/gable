import { computed, html, signal } from '@gable/core';
import { UiButton, UiVirtualList, UiVirtualTable, type VirtualListItem, type VirtualTableColumn } from '@gable/ui';

const ROWS = 100_000;
const FIRST = ['Ada', 'Grace', 'Alan', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Edsger', 'Radia'];
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Torvalds', 'Hamilton', 'Ritchie', 'Liskov', 'Thompson', 'Dijkstra', 'Perlman'];

/** 100,000 generated people. */
export const makePeople = (n = ROWS) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    team: `Team ${(i % 97) + 1}`,
    score: (i * 37) % 1000,
  }));

const COLUMNS: VirtualTableColumn[] = [
  { key: 'id', label: 'ID', width: '90px', align: 'right' },
  { key: 'name', label: 'Name', width: '2fr' },
  { key: 'team', label: 'Team' },
  { key: 'score', label: 'Score', width: '90px', align: 'right' },
];

/** A virtualised list (with pinned group headers) and a virtualised table over 100,000 rows. Only ~20 rows of each are in the DOM. */
export class VirtualDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiButton, UiVirtualList, UiVirtualTable],
    template: html`
      <main class="mx-auto flex max-w-3xl flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Virtual scroll, 100,000 rows</h1>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Virtual list with group headers</h2>
          <div class="flex items-center gap-2">
            <button uiButton variant="outline" size="sm" id="jump" (click)="jump()">Jump to row 50,000</button>
            <span class="text-sm text-muted-foreground" id="picked">{{ pickedLabel() }}</span>
          </div>
          <ui-virtual-list class="h-72" label="People" [items]="listItems" [itemSize]="44" [scrollToIndex]="target()" [(value)]="picked"></ui-virtual-list>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Virtual table</h2>
          <ui-virtual-table class="h-96" label="People table" rowKey="id" [columns]="columns" [rows]="people" [rowHeight]="36"></ui-virtual-table>
        </section>
      </main>
    `,
  };

  people = makePeople();
  columns = COLUMNS;
  // A group header every 1,000 rows.
  listItems: VirtualListItem[] = this.people.map((p, i): VirtualListItem =>
    i % 1000 === 0 ? { id: 'g' + i, label: `Rows ${i + 1} to ${i + 1000}`, header: true } : { id: p.id, label: p.name, description: `${p.team}, score ${p.score}` },
  );
  target = signal<number | null>(null);
  picked = signal<string | number | null>(null);
  pickedLabel = computed(() => (this.picked() === null ? 'Nothing picked' : `Picked id ${this.picked()}`));

  jump(): void {
    this.target.set(50_000 + (this.target() === 50_000 ? 1 : 0));
  }
}
