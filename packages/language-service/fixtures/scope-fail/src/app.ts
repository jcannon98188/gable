import { html, signal } from "@gable/core";

interface Row {
  id: number;
  name: string;
}

export class Scoped {
  static meta = {
    selector: "x-scoped",
    template: html`
      @for (row of rows(); track row.id) {
        <p>{{ row.nam }}</p>
      } @empty {
        <p>{{ $index }}</p>
      }
      <p>{{ row.id }}</p>
      <p>{{ later }}</p>
      @let later = maybe();
      @if (maybe(); as m) {
        <p>{{ m.length }}</p>
      } @else {
        <p>{{ m }}</p>
      }
      <div #pane></div>
      <button (click)="focus(pane)">focus</button>
    `,
  };
  rows = signal<Row[]>([]);
  maybe = signal<string | undefined>(undefined);
  focus(el: HTMLInputElement): void {
    el.focus();
  }
}
