// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { dom } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { TreeDemo, makeBigTree } from './tree-demo.js';

let app: { instance: unknown; destroy(): void } | undefined;
afterEach(() => app?.destroy());

// jsdom has no layout: give the scroll container a height so the virtual tree renders a window.
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 300 });

describe('tree demo', () => {
  it('has tree and JSON viewer semantics, a windowed big tree, and no axe violations', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(TreeDemo, { renderer: dom(), target: '#app' }) as never;
    await whenFlushed();
    await new Promise((r) => setTimeout(r, 20));
    await whenFlushed();
    const trees = document.querySelectorAll('[role=tree]');
    expect(trees).toHaveLength(6);
    expect(makeBigTree().flatMap((f) => f.children!)).toHaveLength(10_000);
    const big = document.querySelector('[aria-label="Big tree"]')!;
    expect(big.querySelectorAll('[role=treeitem]').length).toBeLessThan(60);
    const first = document.querySelector('[aria-label=Files] [role=treeitem]') as HTMLElement;
    first.click();
    await whenFlushed();
    expect(document.getElementById('tree-state')!.textContent).toContain('Selected: 1');
    const routes = document.querySelector('[aria-label=Routes]')!;
    expect([...routes.querySelectorAll('[role=treeitem]')].map((r) => r.getAttribute('aria-level'))).toEqual(['1', '2', '2', '3', '3', '2']);
    expect(routes.querySelector('[aria-selected=true]')!.textContent).toContain('about');
    (routes.querySelector('button[aria-label="Open /about"]') as HTMLElement).click();
    await whenFlushed();
    expect(document.getElementById('route-state')!.textContent).toContain('open /about');
    const narrow = document.querySelector('#narrow-json [title=name]');
    expect(narrow).not.toBeNull();
    await expectNoA11yViolations(document.getElementById('app')!);
  });
});
