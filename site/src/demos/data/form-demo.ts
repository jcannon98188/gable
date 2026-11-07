import { computed, html, signal } from "@gable/core";
import { email, form, minLength, required, requiredTrue, validate, validateAsync, type ErrorObject, type Field } from "@gable/core/forms";
import { debounceTime, delay, of, switchMap } from "rxjs";

/** Handles the pretend server already has. The check below is local, with a delay, standing in for an HTTP call. */
export const TAKEN = ["ada", "grace", "linus"];

export function messageOf(error: ErrorObject): string {
  switch (error.kind) {
    case "required":
      return "Required.";
    case "minLength":
      return `At least ${String(error["min"])} characters.`;
    case "email":
      return "Enter an email like ada@example.com.";
    case "taken":
      return `That handle is taken (${TAKEN.join(", ")} are).`;
    case "mismatch":
      return "Does not match the password.";
    case "requiredTrue":
      return "Please accept the terms.";
    default:
      return "Invalid.";
  }
}

/** The message a field shows: its first error once it is touched or the form was submitted; "Checking..." while pending. */
function shown(field: Field<any>) {
  const s = field.state;
  return computed(() => {
    if (s.pending()) return "Checking availability...";
    const first = s.errors()[0];
    return first && (s.touched() || s.submitted() || first.kind === "taken") ? messageOf(first) : "";
  });
}

/**
 * A sign-up form on the real `@gable/core/forms` API: `form(model, schema)` over a signal, rules from the schema
 * functions, an RxJS async validator, a cross-field rule and `submit()`. Each input is bound with `[field]`.
 */
export class FormDemo {
  static meta = {
    selector: "data-form-demo",
    template: html`
<form class="dd-panel dd-split" novalidate (submit)="onSubmit($event)">
  <div class="dd-fields">
    <div class="dd-field">
      <label for="dd-handle">Handle</label>
      <input id="dd-handle" class="dd-in" autocomplete="off" aria-describedby="dd-handle-e" [field]="f.handle" />
      <p class="dd-err" id="dd-handle-e" [class.dd-ok]="handlePending()" aria-live="polite">{{ handleMsg() }}</p>
    </div>
    <div class="dd-field">
      <label for="dd-email">Email</label>
      <input id="dd-email" class="dd-in" type="email" autocomplete="off" aria-describedby="dd-email-e" [field]="f.email" />
      <p class="dd-err" id="dd-email-e" aria-live="polite">{{ emailMsg() }}</p>
    </div>
    <div class="dd-field">
      <label for="dd-pw">Password</label>
      <input id="dd-pw" class="dd-in" type="password" autocomplete="new-password" aria-describedby="dd-pw-e" [field]="f.password" />
      <p class="dd-err" id="dd-pw-e" aria-live="polite">{{ passwordMsg() }}</p>
    </div>
    <div class="dd-field">
      <label for="dd-confirm">Confirm password</label>
      <input id="dd-confirm" class="dd-in" type="password" autocomplete="new-password" aria-describedby="dd-confirm-e" [field]="f.confirm" />
      <p class="dd-err" id="dd-confirm-e" aria-live="polite">{{ confirmMsg() }}</p>
    </div>
    <div class="dd-field">
      <label class="dd-chk"><input type="checkbox" aria-describedby="dd-terms-e" [field]="f.terms" /> I accept the terms</label>
      <p class="dd-err" id="dd-terms-e" aria-live="polite">{{ termsMsg() }}</p>
    </div>
    <div class="row">
      <button type="submit" class="dd-btn" [disabled]="f.state.submitting()">Create account</button>
      <button type="button" class="dd-btn dd-ghost" (click)="reset()">Reset</button>
    </div>
    <p class="dd-note" aria-live="polite">{{ result() }}</p>
  </div>
  <div>
    <div class="dd-lbl">Field state</div>
    <table class="dd-tbl">
      <thead><tr><th scope="col">field</th><th scope="col">touched</th><th scope="col">dirty</th><th scope="col">status</th></tr></thead>
      <tbody>
        @for (row of rows(); track row.name) {
          <tr><th scope="row">{{ row.name }}</th><td>{{ row.touched }}</td><td>{{ row.dirty }}</td><td>{{ row.status }}</td></tr>
        }
      </tbody>
    </table>
    <p class="dd-note mono">form: valid = {{ formValid() }}, submitted = {{ formSubmitted() }}</p>
    <div class="dd-lbl">Last submitted value</div>
    <pre class="dd-pre">{{ submittedJson() }}</pre>
    <p class="dd-note">The handle check is a local stand-in for a server call (300ms debounce, 400ms delay); nothing is sent anywhere.</p>
  </div>
</form>
    `,
  };

  model = signal({ handle: "", email: "", password: "", confirm: "", terms: false });

  f = form(this.model, (p) => {
    required(p.handle);
    minLength(p.handle, 3);
    validateAsync(p.handle, (value$) =>
      value$.pipe(
        debounceTime(300),
        switchMap((handle) => of(TAKEN.includes(handle.trim().toLowerCase()) ? { kind: "taken" } : null).pipe(delay(400))),
      ),
    );
    required(p.email);
    email(p.email);
    required(p.password);
    minLength(p.password, 8);
    required(p.confirm);
    validate(p.confirm, (value, ctx) => (value !== "" && value !== (ctx.root as Field<{ password: string }>).password() ? { kind: "mismatch" } : null));
    requiredTrue(p.terms);
  });

  handleMsg = shown(this.f.handle);
  emailMsg = shown(this.f.email);
  passwordMsg = shown(this.f.password);
  confirmMsg = shown(this.f.confirm);
  termsMsg = shown(this.f.terms);
  handlePending = computed(() => this.f.handle.state.pending());

  rows = computed(() =>
    (["handle", "email", "password", "confirm", "terms"] as const).map((name) => {
      const s = this.f[name].state;
      return { name, touched: s.touched(), dirty: s.dirty(), status: s.pending() ? "pending" : s.valid() ? "valid" : `${s.errors().length} error` };
    }),
  );
  formValid = computed(() => this.f.state.valid());
  formSubmitted = computed(() => this.f.state.submitted());

  result = signal("");
  submitted = signal<unknown>(undefined);
  submittedJson = computed(() => (this.submitted() === undefined ? "(not submitted yet)" : JSON.stringify(this.submitted(), null, 2)));

  async onSubmit(event: Event) {
    event.preventDefault();
    const outcome = await this.f.submit(async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      this.submitted.set({ ...value, password: "*".repeat(value.password.length), confirm: "*".repeat(value.confirm.length) });
    });
    this.result.set(outcome === "ok" ? "Submitted. The action ran with the model value." : outcome === "invalid" ? "Not submitted: fix the fields above first (the action only runs when the form is valid)." : `Result: ${outcome}`);
  }

  reset() {
    this.f.reset();
    this.result.set("");
    this.submitted.set(undefined);
  }
}
