// @vitest-environment jsdom
import { afterEach, describe, it } from 'vitest';
import { bootstrap } from '@gablejs/core';
import { whenFlushed } from '@gablejs/core/internal';
import { dom } from '@gablejs/renderer-dom';
import { expectNoA11yViolations } from '@gablejs/testing/a11y';
import { Gallery } from './gallery.js';

let app: { destroy(): void } | undefined;
afterEach(() => app?.destroy());

describe('gallery accessibility (axe-core under jsdom)', () => {
  it('has no axe violations', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(Gallery, { renderer: dom(), target: '#app' });
    await whenFlushed();
    await expectNoA11yViolations(document.getElementById('app')!);
  });
});
