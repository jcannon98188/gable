import { describe, expect, it } from 'vitest';
import { mount } from '@gable/testing';
import { provideTestDom } from '@gable/ui-primitives/testing';
import { VirtualDemo } from './virtual-demo.js';

describe('virtual scroll demo', () => {
  it('holds 100,000 rows in memory but renders a handful of nodes', async () => {
    const app = mount(VirtualDemo, { providers: provideTestDom() });
    await app.settle();
    expect(app.instance.people).toHaveLength(100_000);
    const table = app.query('ui-virtual-table')!;
    app.dispatch(table, 'scroll', { target: { scrollTop: 0, clientHeight: 360 } });
    await app.settle();
    expect(table.attrs['aria-rowcount']).toBe('100001');
    expect(app.queryAll('[role=row][data-index]').length).toBeLessThan(30);
  });
});
