// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { dom } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { DateDemo } from './date-demo.js';

let app: { instance: unknown; destroy(): void } | undefined;
afterEach(() => app?.destroy());

describe('calendar and date picker demo', () => {
  it('picks a day and has no axe violations', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(DateDemo, { renderer: dom(), target: '#app' }) as never;
    await whenFlushed();
    const first = document.querySelector<HTMLElement>('ui-calendar [role=gridcell]:not([aria-disabled]):not([data-outside])')!;
    first.click();
    await whenFlushed();
    expect(document.getElementById('date-day')!.textContent).not.toContain('none');
    await expectNoA11yViolations(document.getElementById('app')!);
  });
});
