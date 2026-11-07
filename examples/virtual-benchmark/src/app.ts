import { computed, html, input, signal } from '@gable/core';
import { UiProps, useVirtualizer } from '@gable/ui-primitives';
import { buildRows, type Row } from '../../js-framework-benchmark/src/data.js';

/** The same row component as the js-framework-benchmark's rows case (id, a clickable label, remove), as a div grid. */
export class RowView {
  static meta = {
    selector: 'div[app-row]',
    host: { '[class.danger]': 'selected()' },
    template: html`
      <span>{{ id() }}</span>
      <a class="lbl" (click)="select()">{{ label() }}</a>
      <a class="remove" (click)="remove()">x</a>
    `,
  };
  row = input.required<Row>();
  isSelected = input<boolean>(false);
  picked = input<(id: number) => void>(() => {});
  removed = input<(id: number) => void>(() => {});
  id = computed(() => this.row().id);
  label = computed(() => this.row().label);
  selected = computed(() => this.isSelected());
  select(): void {
    this.picked()(this.id());
  }
  remove(): void {
    this.removed()(this.id());
  }
}

class Store {
  rows = signal<readonly Row[]>([]);
  selected = signal<number | null>(null);
  run(n: number): void {
    this.rows.set(buildRows(n));
  }
  update(): void {
    this.rows.update((rows) => rows.map((row, i) => (i % 10 === 0 ? { id: row.id, label: row.label + ' !!!' } : row)));
  }
  select = (id: number): void => this.selected.set(id);
  remove = (id: number): void => this.rows.update((rows) => rows.filter((r) => r.id !== id));
}

/** Every row is a node. */
export class PlainApp {
  static meta = {
    selector: 'app-root',
    imports: [RowView],
    template: html`
      <div><button id="run1k" (click)="store.run(1000)">1,000</button>
  <button id="run10k" (click)="store.run(10000)">10,000</button>
  <button id="run100k" (click)="store.run(100000)">100,000</button>
  <button id="update" (click)="store.update()">Update every 10th</button>
  <button id="clear" (click)="store.run(0)">Clear</button></div>
      <div id="viewport">
        @for (row of store.rows(); track row.id) {
          <div app-row class="row" [row]="row" [isSelected]="store.selected() === row.id" [picked]="store.select" [removed]="store.remove"></div>
        }
      </div>
    `,
  };
  store = new Store();
}

/** Only the rows in view are nodes. */
export class VirtualApp {
  static meta = {
    selector: 'app-root',
    imports: [RowView, UiProps],
    template: html`
      <div><button id="run1k" (click)="store.run(1000)">1,000</button>
  <button id="run10k" (click)="store.run(10000)">10,000</button>
  <button id="run100k" (click)="store.run(100000)">100,000</button>
  <button id="update" (click)="store.update()">Update every 10th</button>
  <button id="clear" (click)="store.run(0)">Clear</button></div>
      <div id="viewport">
        <div [attr.style]="list.spacerStyle()">
          @for (item of visible(); track item.key) {
            <div app-row class="row" [uiProps]="item.props" [row]="item.row" [isSelected]="item.selected" [picked]="store.select" [removed]="store.remove"></div>
          }
        </div>
      </div>
    `,
  };
  store = new Store();
  list = useVirtualizer({ count: () => this.store.rows().length, itemSize: 38, getKey: (i) => this.store.rows()[i]!.id, overscan: 5, aria: 'none', initialViewport: 400 });
  visible = computed(() => {
    const rows = this.store.rows();
    const selected = this.store.selected();
    return this.list.rows().map((item) => ({ ...item, row: rows[item.index]!, selected: rows[item.index]!.id === selected }));
  });
}
