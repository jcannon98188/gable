// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { createDomRenderer } from '@gable/renderer-dom';
import { DndExamples } from './dnd-examples.js';

let destroy = () => {};
afterEach(() => destroy());
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const column = (n: number) => [...document.querySelectorAll('ui-sortable')].at(n)!;
const titles = (col: Element) => [...col.querySelectorAll('li')].map((li) => li.textContent!.trim().split('\n')[0]!.trim());

describe('drag and drop examples (jsdom)', () => {
  it('renders the playlist and the three kanban columns, and moves a card with the keyboard', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const ref = bootstrap(DndExamples as never, { renderer: createDomRenderer(), target: '#app' }) as unknown as { instance: DndExamples; destroy(): void };
    destroy = () => ref.destroy();
    await settle();
    const app = ref.instance;
    expect(document.querySelectorAll('ui-sortable')).toHaveLength(4);
    expect(document.querySelector('ui-sortable li [data-drag-handle]')).not.toBeNull();

    const card = column(1).querySelectorAll('li')[1] as HTMLElement; // "Fix flaky test"
    card.focus();
    key(card, ' ');
    key(card, 'ArrowRight');
    key(card, ' ');
    await settle();
    expect(app.todo().map((r) => r.id)).toEqual(['k1', 'k3']);
    expect(app.doing().map((r) => r.id)).toEqual(['k4', 'k2']);
    expect(titles(column(2))).toEqual(['Ship the router', 'Fix flaky testCI only']);
    expect(app.lastMove()).toContain('Fix flaky test');
    expect(document.querySelector('[data-dnd-live]')!.textContent).toContain('Dropped Fix flaky test');
  });
});
