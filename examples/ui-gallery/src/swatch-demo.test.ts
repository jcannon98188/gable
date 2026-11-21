// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gablejs/core';
import { whenFlushed } from '@gablejs/core/internal';
import { dom } from '@gablejs/renderer-dom';
import { expectNoA11yViolations } from '@gablejs/testing/a11y';
import { SwatchDemo } from './swatch-demo.js';

let app: { destroy(): void } | undefined;
afterEach(() => app?.destroy());

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
const text = (id: string) => document.getElementById(id)!.textContent;

describe('swatch demo', () => {
  it('previews a focused cell, chooses with a click and has no axe violations', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(SwatchDemo, { renderer: dom(), target: '#app' });
    await settle();
    const cells = [...document.querySelectorAll<HTMLButtonElement>('#colors [role=radio]')];
    expect(cells.filter((c) => c.getAttribute('aria-checked') === 'true').map((c) => c.getAttribute('aria-label'))).toEqual(['Blue 500']);
    cells[1]!.focus();
    await settle();
    expect(text('previewing')).toBe('red-500');
    cells[1]!.click();
    await settle();
    expect(text('chosen-color')).toBe('red-500');
    document.querySelector<HTMLButtonElement>('#spacing [role=radio]')!.click();
    await settle();
    expect(text('chosen-step')).toBe('0');
    await expectNoA11yViolations(document.getElementById('app')!);
  });
});
