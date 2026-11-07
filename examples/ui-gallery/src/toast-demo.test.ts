// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { createDomRenderer } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { PRESENCE_ENV } from '@gable/ui-primitives';
import { ToastDemo } from './toast-demo.js';

let destroy = () => {};
afterEach(() => destroy());
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
const click = (selector: string) => document.querySelector(selector)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const items = () => [...document.querySelectorAll('section[aria-label="Notifications"] li')];

describe('toast demo (jsdom)', () => {
  it('shows toasts in the overlay root, keeps one until its exit animation ends, and has no axe violations', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const providers = [{ provide: PRESENCE_ENV, useValue: { exitDuration: () => 200 } }];
    const ref = bootstrap(ToastDemo as never, { renderer: createDomRenderer(), target: '#app', providers }) as unknown as { destroy(): void };
    destroy = () => ref.destroy();
    await settle();
    click('#success');
    click('#error');
    click('#action');
    await settle();
    expect(items()).toHaveLength(3);
    expect(document.querySelector('#app section')).toBeNull(); // rendered in the overlay root, not inside the app
    await expectNoA11yViolations(document.body);

    (items()[0]!.querySelector('button[aria-label="Close notification"]') as HTMLElement).click();
    await settle();
    expect(items()).toHaveLength(3); // held for the exit
    expect(items()[0]!.getAttribute('data-state')).toBe('closed');
    items()[0]!.dispatchEvent(new Event('animationend'));
    await settle();
    expect(items()).toHaveLength(2);
  });
});
