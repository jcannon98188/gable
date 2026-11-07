// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { dom } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { ChartDemo } from './chart-demo.js';

let app: { destroy(): void } | undefined;
afterEach(() => app?.destroy());

describe('chart demo in a real DOM', () => {
  it('has no axe violations, with a series hidden through the stacked legend', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(ChartDemo, { renderer: dom(), target: '#app' });
    await whenFlushed();
    await expectNoA11yViolations(document.getElementById('app')!);
    const stacked = document.querySelectorAll('ui-chart')[1]!;
    (stacked.querySelectorAll('[data-chart-legend-item]')[0] as HTMLButtonElement).click();
    await whenFlushed();
    expect(stacked.querySelectorAll('[data-chart-legend-item]')[0]!.getAttribute('aria-pressed')).toBe('false');
    await expectNoA11yViolations(document.getElementById('app')!);
  });
});
