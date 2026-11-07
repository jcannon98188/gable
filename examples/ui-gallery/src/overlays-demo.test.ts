// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { dom } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { OverlaysDemo } from './overlays-demo.js';

let app: { destroy(): void } | undefined;
afterEach(() => app?.destroy());

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};

describe('overlays demo', () => {
  it('picks a signal, describes a disabled control by its wrapper and has no axe violations', async () => {
    // jsdom has neither; the popover positioning observes with both
    for (const Observer of ["ResizeObserver", "IntersectionObserver"]) {
      (globalThis as Record<string, unknown>)[Observer] ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(OverlaysDemo, { renderer: dom(), target: '#app' });
    await settle();
    document.querySelector<HTMLButtonElement>('#picker [aria-haspopup]')!.click();
    await settle();
    expect(document.querySelectorAll('[role=option] [data-part=badge]')).toHaveLength(5);
    await expectNoA11yViolations(document.body);
    document.querySelectorAll<HTMLElement>('[role=option]')[3]!.click();
    await settle();
    expect(document.getElementById('bound')!.textContent).toBe('theme');
    expect(document.activeElement).toBe(document.querySelector('#picker [aria-haspopup]'));

    const wrap = document.getElementById('wrap')!;
    expect(wrap.getAttribute('tabindex')).toBe('0');
    wrap.focus();
    await settle();
    expect(wrap.getAttribute('aria-describedby')).toBe(document.querySelector('[role=tooltip]')!.id);
    expect(wrap.querySelector('button')!.disabled).toBe(true);
    expect(document.querySelector<HTMLElement>('[role=tooltip]')!.hidden).toBe(false);
  });
});
