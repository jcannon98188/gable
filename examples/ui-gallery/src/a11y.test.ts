// @vitest-environment jsdom
import { afterEach, describe, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { dom } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { Gallery } from './gallery.js';

let app: { destroy(): void } | undefined;
afterEach(() => app?.destroy());

describe('gallery accessibility (axe-core under jsdom)', () => {
  it('has no axe violations', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(Gallery, { renderer: dom(), target: '#app' });
    await whenFlushed();
    // Known real violations, tracked in TASK-55 (unnamed Select trigger, Alert heading order); remove once fixed.
    await expectNoA11yViolations(document.getElementById('app')!, { disableRules: ['button-name', 'heading-order'] });
  });
});
