// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '@gable/core';
import { whenFlushed } from '@gable/core/internal';
import { dom } from '@gable/renderer-dom';
import { expectNoA11yViolations } from '@gable/testing/a11y';
import { OtpDemo } from './otp-demo.js';

let app: { instance: unknown; destroy(): void } | undefined;
afterEach(() => app?.destroy());

describe('input OTP demo', () => {
  it('pastes a code, completes it and has no axe violations', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(OtpDemo, { renderer: dom(), target: '#app' }) as never;
    await whenFlushed();
    const first = document.querySelector<HTMLInputElement>('input[data-otp-slot]')!;
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    paste.clipboardData = { getData: () => '123456' };
    first.dispatchEvent(paste);
    await whenFlushed();
    expect(document.getElementById('otp-verified')!.textContent).toContain('123456');
    await expectNoA11yViolations(document.getElementById('app')!);
  });
});
