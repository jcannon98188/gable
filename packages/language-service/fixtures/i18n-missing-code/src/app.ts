import { I18n, i18n, inject, signal } from "@gable/core";

export class Inbox {
  #i18n = inject(I18n);
  count = signal(3);
  title = i18n`Inbox (${this.count})`;
  saved = i18n`:status@@saved:Saved`;
  tip = i18n`Click to refresh`;
  label = () => this.#i18n.t`${this.count()} items`;
  done = () => inject(I18n).t`All done`;
  other = () => this.fetcher.t`Not the service`;
  fetcher = { t: (_s: TemplateStringsArray) => "" };
}
