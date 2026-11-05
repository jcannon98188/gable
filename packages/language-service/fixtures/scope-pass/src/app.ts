import { html, signal } from "@gable/core";

interface Row {
  id: number;
  name: string;
  tags: string[];
}

export class Scoped {
  static meta = {
    selector: "x-scoped",
    template: html`
      @for (row of rows(); track row.id) {
        @let label = row.name;
        <p>{{ label }} {{ $index }} {{ $first }} {{ $last }} {{ $count }} {{ $even }} {{ $odd }}</p>
        @for (tag of row.tags; track tag) {
          <b>{{ tag }} {{ row.id }} {{ $index }}</b>
        }
      } @empty {
        <p>{{ emptyText() }}</p>
      }
      @if (maybe(); as m) {
        <p>{{ m.length }}</p>
      } @else {
        <p>none</p>
      }
      <input #box />
      <button (click)="focus(box)">focus</button>
      <p>{{ box.value }}</p>
    `,
  };
  rows = signal<Row[]>([]);
  emptyText = signal("empty");
  maybe = signal<string | undefined>(undefined);
  focus(el: HTMLInputElement): void {
    el.focus();
  }
}
