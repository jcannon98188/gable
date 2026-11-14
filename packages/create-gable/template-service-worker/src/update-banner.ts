import { html, inject } from "@gable/core";
import { SwUpdates } from "@gable/service-worker";

export class UpdateBanner {
  static meta = {
    selector: "app-update-banner",
    template: html`
      @if (available()) {
        <p class="update mt-4 rounded border p-3">
          A new version is ready.
          <button class="rounded bg-sky-600 px-3 py-1 text-white" (click)="update()">Reload</button>
        </p>
      }
    `,
  };

  updates = inject(SwUpdates);
  available = this.updates.updateAvailable;

  async update() {
    if (await this.updates.activateUpdate()) location.reload();
  }
}
