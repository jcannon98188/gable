import { describe, expect, it } from 'vitest';
import { mount } from '@gable/testing';
import { provideTestDom } from '@gable/ui-primitives/testing';
import { ChartDemo } from './chart-demo.js';

describe('chart demo', () => {
  it('renders a chart of each type, plus a stacked one with labelled points', async () => {
    const app = mount(ChartDemo, { providers: provideTestDom() });
    await app.settle();
    expect(app.queryAll('ui-chart')).toHaveLength(6);
    const labels = app.queryAll('[data-chart-point]').map((p) => p.attrs['aria-label']);
    expect(labels).toContain('March: Desktop 237, Mobile 120');
    expect(labels).toContain('Chrome: Visitors 275 (29.7%)');
    expect(app.queryAll('table[data-chart-table]')).toHaveLength(6);
  });
});
