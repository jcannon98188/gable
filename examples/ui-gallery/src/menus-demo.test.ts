// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { createDomRenderer } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { MenusDemo } from './menus-demo.js';

let destroy = () => {};
afterEach(() => destroy());
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
const text = (selector: string) => document.querySelector(selector)!.textContent;
const pointerMove = (el: Element) => {
  const event = new MouseEvent('pointermove', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  el.dispatchEvent(event);
};
const boot = async () => {
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  g.CSS ??= {};
  g.CSS.escape ??= (s) => s.replace(/([^\w-])/g, '\\$1');
  for (const Observer of ['ResizeObserver', 'IntersectionObserver']) {
    (globalThis as Record<string, unknown>)[Observer] ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  document.body.innerHTML = '<div id="app"></div>';
  const ref = bootstrap(MenusDemo as never, { renderer: createDomRenderer(), target: '#app' }) as unknown as { destroy(): void };
  destroy = () => ref.destroy();
  await settle();
};

describe('menus demo (jsdom)', () => {
  it('opens a submenu with ArrowRight, picks a submenu item and a radio item, and has no axe violations', async () => {
    await boot();
    (document.querySelector('.menu-trigger') as HTMLElement).click();
    await settle();
    await expectNoA11yViolations(document.body);

    const share = [...document.querySelectorAll('[role=menuitem][aria-haspopup=menu]')].find((el) => el.textContent?.includes('Share'))!;
    pointerMove(share);
    await settle();
    share.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await settle();
    expect(share.getAttribute('aria-expanded')).toBe('true');
    await expectNoA11yViolations(document.body);
    const email = [...document.querySelectorAll('[role=menuitem]')].find((el) => el.textContent?.trim() === 'Email') as HTMLElement;
    email.click();
    await settle();
    expect(text('#last')).toBe('email');

    (document.querySelector('.menu-trigger') as HTMLElement).click();
    await settle();
    const dark = [...document.querySelectorAll('[role=menuitemradio]')].find((el) => el.textContent?.includes('Dark')) as HTMLElement;
    dark.click();
    await settle();
    expect(text('#theme')).toBe('dark');
  });

  it('renders the range slider with two named thumbs and the starting range', async () => {
    await boot();
    const thumbs = [...document.querySelectorAll('[data-scope=slider][data-part=thumb]')];
    expect(thumbs.map((t) => t.getAttribute('aria-label'))).toEqual(['Minimum price', 'Maximum price']);
    expect(text('#price')).toBe('100,300');
  });
});
