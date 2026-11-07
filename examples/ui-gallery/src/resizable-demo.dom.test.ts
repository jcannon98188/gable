// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { dom } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { ResizableDemo } from './resizable-demo.js';

let app: { destroy(): void } | undefined;
afterEach(() => app?.destroy());

const boot = async () => {
  document.body.innerHTML = '<div id="app"></div>';
  app = bootstrap(ResizableDemo, { renderer: dom(), target: '#app' });
  await whenFlushed();
};
const press = async (el: Element, key: string) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await whenFlushed();
};
const text = (id: string) => document.getElementById(id)!.textContent!;

describe('resizable demo in a real DOM', () => {
  it('mirrors the arrow keys in the right-to-left group only', async () => {
    await boot();
    const rtl = document.querySelector('[aria-label="Resize RTL panels"]')!;
    expect(text('rtl-layout')).toContain('Layout: 30 / 70');
    await press(rtl, 'ArrowLeft'); // the first panel is on the right, so Left grows it
    expect(text('rtl-layout')).toContain('Layout: 40 / 60');
    await press(rtl, 'ArrowRight');
    await press(rtl, 'ArrowRight');
    expect(text('rtl-layout')).toContain('Layout: 20 / 80');
    // The left-to-right cascade group is not mirrored.
    await press(document.querySelector('[aria-label="Resize A and B"]')!, 'ArrowRight');
    expect(text('cascade-layout')).toContain('Layout: 44 / 23 / 33');
  });

  it('has no axe violations', async () => {
    await boot();
    await expectNoA11yViolations(document.getElementById('app')!);
  });
});
