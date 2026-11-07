// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { createDomRenderer } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { ButtonGroupDemo } from './button-group-demo.js';

let destroy = () => {};
afterEach(() => destroy());
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
const text = (selector: string) => document.querySelector(selector)!.textContent;
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
  const ref = bootstrap(ButtonGroupDemo as never, { renderer: createDomRenderer(), target: '#app' }) as unknown as { destroy(): void };
  destroy = () => ref.destroy();
  await settle();
};

describe('button group demo (jsdom)', () => {
  it('renders labelled groups, the split button works, and there are no axe violations', async () => {
    await boot();
    const groups = [...document.querySelectorAll('ui-button-group')];
    expect(groups.map((g) => g.getAttribute('role'))).toEqual(['group', 'group', 'group', 'group', 'group']);
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Text alignment', 'Zoom', 'Address', 'Save options', 'Device']);
    expect(groups[1]!.getAttribute('data-orientation')).toBe('vertical');
    await expectNoA11yViolations(document.body);

    (document.querySelector('.split-main') as HTMLElement).click();
    await settle();
    expect(text('#saved')).toBe('1');

    const chevron = document.querySelector('.split-chevron') as HTMLElement;
    expect(chevron.getAttribute('aria-label')).toBe('More save options');
    chevron.click();
    await settle();
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
    await expectNoA11yViolations(document.body);
    const copy = [...document.querySelectorAll('[role=menuitem]')].find((el) => el.textContent?.includes('Save a copy')) as HTMLElement;
    copy.click();
    await settle();
    expect(text('#picked')).toBe('copy');
  });

  it('has a small segmented toggle group and button group with a selected state', async () => {
    await boot();
    const items = [...document.querySelectorAll('.modes [data-part=item]')] as HTMLElement[];
    expect(items.map((i) => i.getAttribute('data-state'))).toEqual(['on', 'off', 'off', 'off']);
    items[1]!.click();
    await settle();
    expect(text('#mode')).toBe('code');
    expect(items[3]!.querySelector('.sr-only')!.textContent).toBe('Schedule view');
    const buttons = [...document.querySelectorAll('.devices button')] as HTMLElement[];
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    buttons[2]!.click();
    await settle();
    expect(text('#device')).toBe('desktop');
    expect(buttons[2]!.getAttribute('aria-pressed')).toBe('true');
    await expectNoA11yViolations(document.body);
  });
});
