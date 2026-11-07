import { computed, html, inject, input } from "@gable/core";
import { ScrollAreaState, UiProps } from "@gable/ui-primitives";

/**
 * A scroll container with a custom, themable scrollbar (Zag's scroll-area measures the viewport and positions the thumb).
 *
 *   <ui-scroll-area class="h-48 w-64 rounded-md border"> ...long content... </ui-scroll-area>
 *
 * Give it a size with classes; vertical scrolling is on by default, `horizontal` adds the horizontal bar. Layout is
 * measured from the real element, so it needs a browser (jsdom has no layout).
 */
export class UiScrollArea {
  static meta = {
    selector: "ui-scroll-area",
    host: { class: "relative block overflow-hidden" },
    providers: [ScrollAreaState],
    imports: [UiProps],
    template: html`
      <div [uiProps]="rootProps()" class="relative size-full overflow-hidden">
        <div [uiProps]="viewportProps()" class="size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1">
          <div [uiProps]="contentProps()"><slot></slot></div>
        </div>
        <div [uiProps]="verticalBarProps()" class="flex h-full w-2.5 touch-none border-l border-l-transparent p-px transition-colors select-none">
          <div [uiProps]="verticalThumbProps()" class="relative flex-1 rounded-full bg-border"></div>
        </div>
        @if (horizontal()) {
          <div [uiProps]="horizontalBarProps()" class="flex h-2.5 w-full touch-none flex-col border-t border-t-transparent p-px transition-colors select-none">
            <div [uiProps]="horizontalThumbProps()" class="relative flex-1 rounded-full bg-border"></div>
          </div>
        }
        <div [uiProps]="cornerProps()"></div>
      </div>
    `,
  };

  /** Also show a horizontal scrollbar. */
  horizontal = input<boolean>(false);

  state = inject(ScrollAreaState).bind(() => ({}));
  rootProps = computed(() => this.state.api().getRootProps());
  viewportProps = computed(() => this.state.api().getViewportProps());
  contentProps = computed(() => this.state.api().getContentProps());
  verticalBarProps = computed(() => this.state.api().getScrollbarProps({ orientation: "vertical" }));
  verticalThumbProps = computed(() => this.state.api().getThumbProps({ orientation: "vertical" }));
  horizontalBarProps = computed(() => this.state.api().getScrollbarProps({ orientation: "horizontal" }));
  horizontalThumbProps = computed(() => this.state.api().getThumbProps({ orientation: "horizontal" }));
  cornerProps = computed(() => this.state.api().getCornerProps());
}
