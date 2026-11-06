import { computed, html, inject, input } from '@gable/core';
import type { Row } from '../data.js';
import { RowStore } from '../services/row-store.js';

export class RowView {
  static meta = {
    selector: 'tr[app-row]',
    host: { '[class.danger]': 'selected()' },
    template: html`
      <td class="col-md-1">{{ id() }}</td>
      <td class="col-md-4"><a class="lbl" (click)="select()">{{ label() }}</a></td>
      <td class="col-md-1">
        <a class="remove" (click)="remove()"><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a>
      </td>
      <td class="col-md-6"></td>
    `,
  };

  store = inject(RowStore);
  row = input.required<Row>();
  id = computed(() => this.row().id);
  label = computed(() => this.row().label);
  selected = computed(() => this.store.selected() === this.id());

  select(): void {
    this.store.select(this.id());
  }

  remove(): void {
    this.store.remove(this.id());
  }
}
