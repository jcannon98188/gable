import { computed, contentChildren, effect, html, input, model, signal, untracked } from "@gable/core";
import { UiProps, bindProps, useCarousel } from "@gable/ui-primitives";
import { UiIcon } from "../lib/icon.js";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";
import { UiButton } from "./button.js";

/**
 * One slide of `<ui-carousel>`. The carousel numbers its slides and hands each its position (projected content cannot
 * inject from the carousel, so it is pushed, as for `<ui-tab>`); the slide labels itself "2 of 5" for screen readers.
 */
export class UiCarouselItem {
  static meta = { selector: "ui-carousel-item" };
  class = input<string>("");
  /** Set by the carousel: 1-based position, the slide count and the label pattern. */
  position = signal(0);
  total = signal(0);
  labelPattern = signal("{position} of {total}");
  private classes = useHostClass(() => cn("block min-w-0 shrink-0 grow-0 basis-full snap-start", this.class()));
  private aria = bindProps(() => ({
    role: "group",
    "aria-roledescription": "slide",
    "aria-label": this.labelPattern().replace("{position}", String(this.position())).replace("{total}", String(this.total())),
    "data-carousel-slide": "",
  }));
}

/**
 * A carousel on CSS scroll-snap: swipe, wheel or the scrollbar scroll the slides natively and the carousel follows.
 *
 *   <ui-carousel label="Featured" [(index)]="slide" [indicators]="true" [autoplay]="5000" [loop]="true">
 *     <ui-carousel-item>One</ui-carousel-item>
 *     <ui-carousel-item>Two</ui-carousel-item>
 *   </ui-carousel>
 *
 * Previous and next buttons (disabled at the ends unless `loop`), Left/Right/Home/End from inside the carousel, and
 * optional indicator dots. `autoplay` is the delay in milliseconds; it pauses while the pointer is over the carousel or
 * keyboard focus is inside it, never runs when the user prefers reduced motion, and shows a pause/play button. The
 * slide area is `aria-live="off"` while slides advance by themselves and `polite` otherwise, so a manual change is announced.
 *
 * Semantics: the carousel is a labelled region (`aria-roledescription="carousel"`), each slide a group
 * (`aria-roledescription="slide"`, "n of m"). The strings (`label`, `previousLabel`, ...) are inputs so apps can translate
 * them. Horizontal and left-to-right only.
 */
export class UiCarousel {
  static meta = {
    selector: "ui-carousel",
    imports: [UiButton, UiIcon, UiProps],
    template: html`
      <div class="relative">
        <div
          [uiProps]="viewportProps()"
          class="flex snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-[inherit] outline-none [scrollbar-width:none] focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
        >
          <slot></slot>
        </div>
        @if (controls()) {
          <button uiButton variant="outline" size="icon" type="button" [attr.aria-label]="previousLabel()" [disabled]="!canPrev()" (click)="prev()" class="absolute top-1/2 left-2 size-8 -translate-y-1/2 rounded-full">
            <svg uiIcon="chevron-left"></svg>
          </button>
          <button uiButton variant="outline" size="icon" type="button" [attr.aria-label]="nextLabel()" [disabled]="!canNext()" (click)="next()" class="absolute top-1/2 right-2 size-8 -translate-y-1/2 rounded-full">
            <svg uiIcon="chevron-right"></svg>
          </button>
        }
      </div>
      @if (showFooter()) {
        <div class="mt-3 flex items-center justify-center gap-3">
          @if (hasAutoplay()) {
            <button type="button" [attr.aria-label]="toggleLabel()" (click)="toggle()" class="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
              {{ toggleText() }}
            </button>
          }
          @if (indicators()) {
            <div class="flex items-center gap-2">
              @for (dot of dots(); track dot.index) {
                <button [uiProps]="dot.props" [attr.class]="dot.classes"></button>
              }
            </div>
          }
        </div>
      }
    `,
  };

  /** The accessible name of the carousel. */
  label = input<string>("Carousel");
  /** Two-way: the slide in view, 0-based. */
  index = model<number>(0);
  /** Wrap around at the ends. */
  loop = input<boolean>(false);
  /** Show the previous/next buttons. */
  controls = input<boolean>(true);
  /** Show indicator dots. */
  indicators = input<boolean>(false);
  /** Milliseconds between automatic slides; 0 (default) is off. */
  autoplay = input<number>(0);
  class = input<string>("");
  previousLabel = input<string>("Previous slide");
  nextLabel = input<string>("Next slide");
  /** Pattern of a slide's label: `{position}` and `{total}`. */
  slideLabel = input<string>("{position} of {total}");
  /** Pattern of an indicator's label: `{position}`. */
  indicatorLabel = input<string>("Go to slide {position}");
  pauseLabel = input<string>("Stop automatic slide show");
  playLabel = input<string>("Start automatic slide show");

  items = contentChildren(UiCarouselItem);
  private carousel = useCarousel({ count: () => this.items().length, loop: () => this.loop(), autoplay: () => this.autoplay() });
  canPrev = this.carousel.canPrev;
  canNext = this.carousel.canNext;
  hasAutoplay = computed(() => this.autoplay() > 0);
  showFooter = computed(() => this.indicators() || this.hasAutoplay());
  toggleText = computed(() => (this.carousel.playing() ? "Pause" : "Play"));
  toggleLabel = computed(() => (this.carousel.playing() ? this.pauseLabel() : this.playLabel()));
  prev = () => this.carousel.prev();
  next = () => this.carousel.next();
  toggle = () => this.carousel.toggle();

  private classes = useHostClass(() => cn("relative block w-full", this.class()));
  private region = bindProps(() => ({ role: "region", "aria-roledescription": "carousel", "aria-label": this.label() }));
  viewportProps = computed(() => ({
    "data-carousel-viewport": "",
    // The viewport scrolls, so it must be reachable by keyboard; arrow keys are handled on the carousel.
    tabindex: 0,
    "aria-live": this.carousel.autoplaying() ? "off" : "polite",
  }));
  dots = computed(() => {
    const current = this.carousel.index();
    const pattern = this.indicatorLabel();
    return this.items().map((_, i) => ({
      index: i,
      classes: cn("size-2 rounded-full bg-muted-foreground/30 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50", i === current && "bg-primary"),
      props: { type: "button", "aria-label": pattern.replace("{position}", String(i + 1)), "aria-current": i === current ? "true" : undefined, onclick: () => this.carousel.goTo(i) },
    }));
  });

  private link = effect(() => {
    const all = this.items();
    const pattern = this.slideLabel();
    all.forEach((item, i) => {
      item.position.set(i + 1);
      item.total.set(all.length);
      item.labelPattern.set(pattern);
    });
  });
  // The model follows the scroll position, and a bound value scrolls to its slide.
  private sync = effect(() => {
    const current = this.carousel.index();
    if (current !== untracked(this.index)) this.index.set(current);
  });
  private follow = effect(() => {
    const wanted = this.index();
    if (wanted !== untracked(this.carousel.index)) this.carousel.goTo(wanted);
  });
}
