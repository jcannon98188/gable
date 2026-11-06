import { signal } from '@gable/core';
import { buildRows, type Row } from '../data.js';

/** The benchmark's state and operations. Rows are immutable; "update" replaces the touched rows, which `@for` keeps keyed by id. */
export class RowStore {
  static scope = 'root';

  rows = signal<readonly Row[]>([]);
  selected = signal<number | null>(null);

  run(): void {
    this.rows.set(buildRows(1_000));
  }

  runLots(): void {
    this.rows.set(buildRows(10_000));
  }

  add(): void {
    this.rows.update((rows) => rows.concat(buildRows(1_000)));
  }

  /** Appends " !!!" to every 10th row's label. */
  update(): void {
    this.rows.update((rows) => rows.map((row, i) => (i % 10 === 0 ? { id: row.id, label: row.label + ' !!!' } : row)));
  }

  clear(): void {
    this.rows.set([]);
  }

  /** Swaps rows 2 and 999 (indexes 1 and 998). */
  swapRows(): void {
    const rows = this.rows();
    if (rows.length <= 998) return;
    const next = rows.slice();
    next[1] = rows[998]!;
    next[998] = rows[1]!;
    this.rows.set(next);
  }

  select(id: number): void {
    this.selected.set(id);
  }

  remove(id: number): void {
    this.rows.update((rows) => rows.filter((row) => row.id !== id));
  }
}
