// The template interpreter and keyed list diffing, through @gable/testing's
// in-memory renderer (the same path the suites use; no DOM).
import { computed, html, signal } from "@gable/core";
import { mount } from "@gable/testing";

interface Row {
  id: number;
  label: string;
  done: boolean;
}

const rows = (n: number, from = 0): Row[] => Array.from({ length: n }, (_, i) => ({ id: from + i, label: `row ${from + i}`, done: (from + i) % 3 === 0 }));

class Card {
  static meta = {
    selector: "bench-card",
    template: html`<section class="card" [class.active]="active()" [attr.data-count]="count()">
      <h2>{{ title() }} ({{ count() }})</h2>
      @if (even()) {
        <p class="even">even {{ doubled() }}</p>
      } @else {
        <p class="odd">odd {{ next() }}</p>
      }
      <button (click)="bump()" [disabled]="inactive()">+1</button>
      <ul>
        @for (tag of tags(); track tag) {
          <li [class.first]="$first">{{ $index }} {{ tag }}</li>
        }
      </ul>
    </section>`,
  };
  title = signal("Card");
  count = signal(0);
  active = signal(true);
  tags = signal(["a", "b", "c", "d"]);
  even = computed(() => this.count() % 2 === 0);
  doubled = computed(() => this.count() * 2);
  next = computed(() => this.count() + 1);
  inactive = computed(() => !this.active());
  bump() {
    this.count.set(this.count() + 1);
  }
}

class Dashboard {
  static meta = {
    selector: "bench-dashboard",
    imports: [Card],
    template: html`<main>
      @for (i of cards(); track i) {
        <bench-card></bench-card>
      }
    </main>`,
  };
  cards = signal(Array.from({ length: 50 }, (_, i) => i));
}

class Table {
  static meta = {
    selector: "bench-table",
    template: html`<table>
      @for (row of rows(); track row.id) {
        <tr [class.done]="row.done"><td>{{ row.id }}</td><td>{{ row.label }}</td></tr>
      }
    </table>`,
  };
  rows = signal<Row[]>(rows(1_000));
}

export const benchmarks = {
  /** Mount 50 cards (bindings, @if, a small @for each) and destroy them. */
  "template-mount": {
    async run() {
      const f = mount(Dashboard);
      await f.flush();
      const n = f.queryAll("li").length;
      f.destroy();
      return String(n);
    },
  },
  /** Update every binding of a mounted card 200 times. */
  "template-update": {
    async setup() {
      const f = mount(Card);
      await f.flush();
      return f;
    },
    async run(f: ReturnType<typeof mount<Card>>) {
      for (let i = 0; i < 200; i++) {
        f.instance.count.set(i);
        f.instance.title.set(`Card ${i}`);
        f.instance.active.set(i % 5 !== 0);
        await f.flush();
      }
      return f.query("h2")!.children[0]!.text;
    },
  },
  /** Keyed @for over 1000 rows: reverse, swap two, remove 100, insert 100, replace all. */
  "list-diff": {
    async setup() {
      const f = mount(Table);
      await f.flush();
      return f;
    },
    async run(f: ReturnType<typeof mount<Table>>) {
      const r = f.instance.rows;
      r.set([...r()].reverse());
      await f.flush();
      const swapped = [...r()];
      [swapped[1], swapped[998]] = [swapped[998]!, swapped[1]!];
      r.set(swapped);
      await f.flush();
      r.set(r().filter((x) => x.id % 10 !== 0));
      await f.flush();
      r.set([...r().slice(0, 450), ...rows(100, 10_000), ...r().slice(450)]);
      await f.flush();
      r.set(rows(1_000, 20_000));
      await f.flush();
      r.set(rows(1_000));
      await f.flush();
      return String(f.queryAll("tr").length);
    },
  },
};
