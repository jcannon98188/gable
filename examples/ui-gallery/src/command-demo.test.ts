// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { dom } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { CommandDemo } from './command-demo.js';

let app: { destroy(): void } | undefined;
afterEach(() => app?.destroy());

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};

describe('command demo', () => {
  it('filters, runs a command with the keyboard and has no axe violations', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(CommandDemo, { renderer: dom(), target: '#app' });
    await settle();
    const input = document.querySelector<HTMLInputElement>('#inline input')!;
    input.value = 'bill';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(document.querySelectorAll('#inline [role=option]')).toHaveLength(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    expect(document.getElementById('ran')!.textContent).toBe('Billing');
    await expectNoA11yViolations(document.getElementById('app')!);
  });
});
