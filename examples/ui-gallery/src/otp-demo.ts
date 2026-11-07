import { html, signal } from '@gable/core';
import { form, required, minLength } from '@gable/core/forms';
import { UiInputOtp } from '@gable/ui';

/** Input OTP: a plain model, grouped with a separator, alphanumeric and masked, and bound to a form field. */
export class OtpDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiInputOtp],
    template: html`
      <main class="mx-auto flex max-w-lg flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Input OTP</h1>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Six digits</h2>
          <ui-input-otp [(value)]="code" [length]="6" (complete)="verified.set($event)"></ui-input-otp>
          <p class="text-sm text-muted-foreground" id="otp-code">Code: {{ code() }}</p>
          <p class="text-sm text-muted-foreground" id="otp-verified">Completed: {{ verified() }}</p>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Grouped</h2>
          <ui-input-otp [(value)]="grouped" [length]="6" [groups]="split" label="Grouped code"></ui-input-otp>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Alphanumeric and masked</h2>
          <ui-input-otp [(value)]="backup" [length]="4" pattern="alphanumeric" [mask]="true" label="Backup PIN"></ui-input-otp>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">With [field]</h2>
          <ui-input-otp [field]="login.code" [length]="6" label="Login code"></ui-input-otp>
          @if (login.code.state.touched() && login.code.state.errors().length > 0) {
            <p class="text-sm text-destructive" id="otp-error">Enter all six digits.</p>
          }
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Disabled</h2>
          <ui-input-otp [length]="4" [disabled]="true"></ui-input-otp>
        </section>
      </main>
    `,
  };

  code = signal('');
  verified = signal('');
  grouped = signal('');
  split = [3, 3];
  backup = signal('');
  loginModel = signal({ code: '' });
  login = form(this.loginModel, (p) => {
    required(p.code);
    minLength(p.code, 6);
  });
}
