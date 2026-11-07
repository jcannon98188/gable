import { html, inject } from '@gable/core';
import { ToastService, UiButton, UiToaster } from '@gable/ui';

/** The toast service and `<ui-toaster>`: one region in the app, `ToastService` injected wherever a toast is needed. */
export class ToastDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiButton, UiToaster],
    template: html`
      <main class="mx-auto flex max-w-xl flex-col gap-4 p-8">
        <h1 class="text-2xl font-semibold">Toasts</h1>
        <div class="flex flex-wrap gap-2">
          <button uiButton variant="outline" id="default" (click)="plain()">Default</button>
          <button uiButton variant="outline" id="success" (click)="success()">Success</button>
          <button uiButton variant="outline" id="error" (click)="error()">Error</button>
          <button uiButton variant="outline" id="info" (click)="info()">Info</button>
          <button uiButton variant="outline" id="action" (click)="withAction()">With action</button>
          <button uiButton variant="outline" id="promise" (click)="promise()">Promise</button>
          <button uiButton variant="ghost" id="dismiss" (click)="dismissAll()">Dismiss all</button>
        </div>
        <p class="text-sm text-muted-foreground">Hover or focus the toasts to pause their timers.</p>
      </main>
      <ui-toaster position="bottom-right"></ui-toaster>
    `,
  };

  toast = inject(ToastService);

  plain(): void {
    this.toast.show('Event created', { description: 'Sunday, December 3 at 9:00 AM' });
  }
  success(): void {
    this.toast.success('Changes saved');
  }
  error(): void {
    this.toast.error('Could not reach the server', { description: 'Check your connection and try again.' });
  }
  info(): void {
    this.toast.info('A new version is available');
  }
  withAction(): void {
    this.toast.show('File deleted', { description: 'src/styles/app.css:42', duration: 8000, action: { label: 'Undo', onClick: () => this.toast.success('Restored') } });
  }
  promise(): void {
    const work = new Promise<string>((resolve, reject) => setTimeout(() => (Math.random() > 0.3 ? resolve('Report') : reject(new Error('timeout'))), 1500));
    void this.toast.promise(work, { loading: 'Generating report...', success: (name) => `${name} is ready`, error: 'Report failed' }).catch(() => {});
  }
  dismissAll(): void {
    this.toast.dismiss();
  }
}
