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
  it('renders problems with severity badges and wrapping, unfixed-height rows', async () => {
    const app = mount(VirtualDemo, { providers: provideTestDom() });
    await app.settle();
    const table = app.query('[aria-label="Problems"]')!;
    app.dispatch(table, 'scroll', { target: { scrollTop: 0, clientHeight: 320 } });
    await app.settle();
    const rows = app.queryAll('[aria-label="Problems"] [role=row][data-index]');
    expect(rows.length).toBeGreaterThan(3);
    expect(rows[0]!.attrs.style).not.toContain('height:36px');
    expect(app.queryAll('[aria-label="Problems"] [role=gridcell] span').map((b) => app.textOf(b))).toContain('error');
    expect(app.query('#problems-table td')!.attrs.class).toBeDefined();
  });
});
