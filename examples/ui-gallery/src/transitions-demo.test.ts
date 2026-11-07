// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { provideRouter, provideRouteTransitions } from '@gable/core/router';
import { createDomRenderer } from '@gable/renderer-dom';
import { PRESENCE_ENV } from '@gable/ui-primitives';
import { TransitionsDemo, transitionRoutes } from './transitions-demo.js';

let destroy = () => {};
afterEach(() => destroy());
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
const start = () => {
  window.history.replaceState(null, '', '/');
  document.body.innerHTML = '<div id="app"></div>';
  // jsdom has no layout or animations: report the durations the browser would measure from the CSS.
  const providers = [{ provide: PRESENCE_ENV, useValue: { exitDuration: () => 200 } }, ...provideRouter(transitionRoutes), ...provideRouteTransitions({ all: false, exitDuration: () => 250 })];
  const ref = bootstrap(TransitionsDemo as never, { renderer: createDomRenderer(), target: '#app', providers }) as unknown as { destroy(): void };
  destroy = () => ref.destroy();
};
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

describe('route transitions demo (jsdom)', () => {
  it('keeps the outgoing page until its animation ends, and skips animation for a route that opts out', async () => {
    start();
    await settle();
    const home = document.querySelector('demo-home')!;
    click(document.querySelector('a[href="/inbox"]')!);
    await settle();
    expect(home.getAttribute('data-state')).toBe('closed');
    expect(document.querySelector('demo-inbox')!.getAttribute('data-state')).toBe('open');
    home.dispatchEvent(new Event('animationend'));
    await settle();
    expect(document.querySelector('demo-home')).toBeNull();

    click(document.querySelector('a[href="/about"]')!);
    await settle();
    expect(document.querySelector('demo-inbox')).toBeNull(); // about has transition: false
    expect(document.querySelector('demo-about')).not.toBeNull();
  });

  it('animates list rows out with presence', async () => {
    start();
    await settle();
    click(document.querySelector('a[href="/inbox"]')!);
    await settle();
    document.querySelector('demo-home')?.dispatchEvent(new Event('animationend'));
    const rows = () => document.querySelectorAll('li.row');
    expect(rows()).toHaveLength(2);
    click(rows()[0]!.querySelector('.remove')!);
    await settle();
    expect(rows()).toHaveLength(2); // held for the exit animation
    expect(rows()[0]!.getAttribute('data-state')).toBe('closed');
    rows()[0]!.dispatchEvent(new Event('animationend'));
    await settle();
    expect([...rows()].map((r) => r.querySelector('span')!.textContent)).toEqual(['Your invoice']);
  });
});
