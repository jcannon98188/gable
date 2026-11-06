import { describe, expect, it } from 'vitest';
import { mount } from '@gable/testing';
import { App } from './components/app.js';

type Fixture = ReturnType<typeof mount>;
type Node = NonNullable<ReturnType<Fixture['query']>>;

const rows = (app: Fixture) => app.queryAll('tbody tr');
const cell = (row: Node, column: number) => row.children.filter((child) => child.tag === 'td')[column - 1]!;
const column = (app: Fixture, n: number) => rows(app).map((row) => app.textOf(cell(row, n)));

async function click(app: Fixture, target: Node | string) {
  app.dispatch(typeof target === 'string' ? app.query(target)! : target, 'click');
  await app.flush();
}

describe('js-framework-benchmark UI contract', () => {
  it('creates, appends, updates and clears rows', async () => {
    const app = mount(App);
    await click(app, '#run');
    expect(rows(app)).toHaveLength(1000);
    await click(app, '#add');
    expect(rows(app)).toHaveLength(2000);
    await click(app, '#update');
    const labels = column(app, 2);
    expect(labels.filter((label) => label.endsWith(' !!!'))).toHaveLength(200);
    expect(labels[0]!.endsWith(' !!!')).toBe(true);
    expect(labels[1]!.endsWith(' !!!')).toBe(false);
    await click(app, '#clear');
    expect(rows(app)).toHaveLength(0);
  });

  it('selects, swaps and removes rows', async () => {
    const app = mount(App);
    await click(app, '#run');
    const ids = column(app, 1);
    await click(app, cell(rows(app)[1]!, 2).children[0]!);
    expect(app.queryAll('tr.danger')).toHaveLength(1);
    await click(app, '#swaprows');
    const swapped = column(app, 1);
    expect(swapped[1]).toBe(ids[998]);
    expect(swapped[998]).toBe(ids[1]);
    expect(app.queryAll('tr.danger')).toHaveLength(1);
    await click(app, cell(rows(app)[3]!, 3).children[0]!);
    expect(rows(app)).toHaveLength(999);
    expect(column(app, 1)[3]).toBe(ids[4]);
  });
});
