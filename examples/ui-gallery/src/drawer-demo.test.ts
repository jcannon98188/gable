// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { dom } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { DrawerDemo } from './drawer-demo.js';

let app: { destroy(): void } | undefined;
afterEach(() => app?.destroy());
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
const start = async () => {
  document.body.innerHTML = '<div id="app"></div>';
  app = bootstrap(DrawerDemo as never, { renderer: dom(), target: '#app' }) as unknown as { destroy(): void };
  await settle();
};
let clock = 0;
const pointer = (el: Element, type: string, x: number, y: number) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, 'timeStamp', { value: clock });
  el.dispatchEvent(event);
};

describe('drawer demo (jsdom)', () => {
  it('opens a drawer and drags it closed', async () => {
    await start();
    const open = document.querySelector('[data-t=open-bottom]') as HTMLElement;
    open.click();
    await settle();
    const panel = document.querySelector('[role=dialog]:not([hidden])') as HTMLElement;
    expect(panel.getAttribute('data-state')).toBe('open');
    panel.getBoundingClientRect = () => ({ width: 300, height: 400, top: 0, left: 0, right: 300, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
    clock = 0;
    pointer(panel, 'pointerdown', 50, 100);
    clock = 400;
    pointer(panel, 'pointermove', 50, 350);
    clock = 800;
    pointer(panel, 'pointerup', 50, 350);
    await settle();
    expect(panel.getAttribute('data-state')).toBe('closed');
  });

  it('has no axe violations with a drawer open', async () => {
    await start();
    (document.querySelector('[data-t=open-snap]') as HTMLElement).click();
    await settle();
    await expectNoA11yViolations(document.body);
  });
});
