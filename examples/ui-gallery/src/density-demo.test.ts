// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gablejs/core';
import { whenFlushed } from '@gablejs/core/internal';
import { dom } from '@gablejs/renderer-dom';
import { expectNoA11yViolations } from '@gablejs/testing/a11y';
import { DensityDemo } from './density-demo.js';

let app: { instance: unknown; destroy(): void } | undefined;
afterEach(() => app?.destroy());

describe('density demo', () => {
  it('renders compact controls, clears the input and has no axe violations', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(DensityDemo, { renderer: dom(), target: '#app' }) as never;
    await whenFlushed();
    expect(document.querySelector('#compact-row button')!.className).toContain('h-6.5');
    expect(document.querySelector('input[aria-label="Compact input"]')!.className).toContain('h-6.5');

    const search = document.querySelector<HTMLInputElement>('input[aria-label="Search classes"]')!;
    search.value = 'flex';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await whenFlushed();
    expect(document.getElementById('query-value')!.textContent).toContain('flex');
    document.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]')!.click();
    await whenFlushed();
    expect(document.getElementById('query-value')!.textContent!.trim()).toBe('Query:');
    expect(document.activeElement).toBe(search);

    await expectNoA11yViolations(document.getElementById('app')!);
  });
});
