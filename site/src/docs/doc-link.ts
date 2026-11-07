import { computed, inject, input } from "@gable/core";
import { Router } from "@gable/core/router";
import { withBase } from "./base.js";

interface ClickLike {
  button?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault?(): void;
}

/**
 * `<a [docLink]="'/docs/router'">`: an in-app link. The `href` includes the deploy base (so open-in-new-tab, copy link and
 * crawlers see the real URL, which core's `routerLink` leaves base-less), and a plain click navigates without a page load.
 * Without a router (a component mounted on its own) it is an ordinary link.
 */
export class DocLink {
  static meta = { selector: "[docLink]", host: { "[attr.href]": "href()", "(click)": "onClick($event)" } };

  private router = inject(Router, { optional: true });
  docLink = input<string>("");
  href = computed(() => withBase(this.docLink()));

  onClick(event?: ClickLike): void {
    if (!this.router || (event && (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey))) return;
    event?.preventDefault?.();
    void this.router.navigate(this.docLink());
  }
}
