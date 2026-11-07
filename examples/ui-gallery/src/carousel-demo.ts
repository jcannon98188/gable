import { computed, html, signal } from '@gable/core';
import { UiCard, UiCarousel, UiCarouselItem } from '@gable/ui';

const SLIDES = ['Build', 'Test', 'Ship', 'Learn'];

/** Carousels on CSS scroll-snap: controls and indicators with a bound index, and an autoplaying, looping one. */
export class CarouselDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiCard, UiCarousel, UiCarouselItem],
    template: html`
      <main class="mx-auto flex max-w-xl flex-col gap-10 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Carousel</h1>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Controls and indicators</h2>
          <ui-carousel label="Release steps" [(index)]="slide" [indicators]="true" class="px-12">
            @for (step of steps; track step) {
              <ui-carousel-item>
                <div class="p-1">
                  <ui-card class="flex aspect-video items-center justify-center text-4xl font-semibold">{{ step }}</ui-card>
                </div>
              </ui-carousel-item>
            }
          </ui-carousel>
          <p class="text-center text-sm text-muted-foreground" id="current">{{ currentLabel() }}</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Autoplay and loop</h2>
          <p class="text-sm text-muted-foreground">Pauses on hover and keyboard focus; does not run when you prefer reduced motion.</p>
          <ui-carousel label="Highlights" [autoplay]="3000" [loop]="true" [indicators]="true" [controls]="false">
            @for (step of steps; track step) {
              <ui-carousel-item>
                <div class="p-1">
                  <ui-card class="flex aspect-video items-center justify-center text-4xl font-semibold">{{ step }}</ui-card>
                </div>
              </ui-carousel-item>
            }
          </ui-carousel>
        </section>
      </main>
    `,
  };
  steps = SLIDES;
  slide = signal(0);
  currentLabel = computed(() => `Slide ${this.slide() + 1} of ${SLIDES.length}: ${SLIDES[this.slide()]}`);
}
