import { computed, html, inject, input } from "@gable/core";
import { AvatarState, UiProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";

/**
 * An avatar: the image when it loads, otherwise the fallback text (initials).
 *
 *   <ui-avatar src="/me.png" alt="Ada" fallback="AL"></ui-avatar>
 *
 * Size it with `class` (`size-12`).
 */
export class UiAvatar {
  static meta = {
    selector: "ui-avatar",
    host: { class: "inline-block" },
    providers: [AvatarState],
    imports: [UiProps],
    template: html`
      <span [uiProps]="rootProps()" [attr.class]="rootClasses()">
        <img [uiProps]="imageProps()" [attr.src]="src()" [attr.alt]="alt()" class="aspect-square size-full" />
        <span [uiProps]="fallbackProps()" class="flex size-full items-center justify-center rounded-full bg-muted">{{ fallback() }}</span>
      </span>
    `,
  };

  src = input<string>("");
  alt = input<string>("");
  fallback = input<string>("");
  class = input<string>("");

  state = inject(AvatarState).bind(() => ({}));
  rootProps = computed(() => this.state.api().getRootProps());
  imageProps = computed(() => this.state.api().getImageProps());
  fallbackProps = computed(() => this.state.api().getFallbackProps());
  rootClasses = computed(() => cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", this.class()));
}
