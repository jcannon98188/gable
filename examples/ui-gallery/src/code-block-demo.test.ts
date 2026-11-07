// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { dom } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { CodeBlockDemo, TS_SAMPLE } from './code-block-demo.js';

let app: { destroy(): void } | undefined;
afterEach(() => app?.destroy());

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};

describe('code block demo', () => {
  it('renders highlighted code and diffs, copies, and has no axe violations', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(CodeBlockDemo, { renderer: dom(), target: '#app' });
    await settle();
    const ts = document.getElementById('ts')!;
    expect([...ts.querySelectorAll('pre > code > span')].map((l) => l.lastElementChild!.textContent).join('\n')).toBe(TS_SAMPLE);
    expect([...ts.querySelectorAll('code > span')].filter((l) => l.className.includes('bg-primary/10'))).toHaveLength(3);
    expect([...ts.querySelectorAll('code span')].some((s) => s.textContent === 'import' && s.className.includes('violet'))).toBe(true);
    expect(document.querySelectorAll('ui-code-block')).toHaveLength(9);
    expect([...document.querySelectorAll('#diff-text code > span')].filter((l) => l.className.includes('bg-emerald-500'))).toHaveLength(3);
    expect(document.querySelectorAll('#diff-computed code > span')[0]!.textContent).toBe('@@ -2,3 +2,3 @@');
    expect(document.querySelector('#diff-split code > span > span.col-span-2')).not.toBeNull();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
    ts.querySelector('button')!.click();
    await settle();
    expect(document.getElementById('copy-state')!.textContent).toBe('Copy: copied');
    await expectNoA11yViolations(document.getElementById('app')!);
  });
});
