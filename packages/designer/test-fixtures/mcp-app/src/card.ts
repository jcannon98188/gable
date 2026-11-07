import { html, signal } from "@gable/core";

export class ProfileCard {
  static meta = {
    selector: "app-profile-card",
    imports: [],
    template: html`
      <section class="card p-4 text-sm">
        <h2 class="font-bold">Ada Lovelace</h2>
        <p>Analyst</p>
        <button (click)="follow()">Follow</button>
      </section>
    `,
  };
  followed = signal(false);
  follow() {
    this.followed.set(true);
  }
}
