import { computed, html, signal } from '@gable/core';
import { UiSwatchGrid, type SwatchItem } from '@gable/ui';

const COLORS: SwatchItem[] = [
  { value: 'slate-500', label: 'Slate 500', color: '#64748b' },
  { value: 'red-500', label: 'Red 500', color: '#ef4444' },
  { value: 'orange-500', label: 'Orange 500', color: '#f97316' },
  { value: 'amber-500', label: 'Amber 500 (unavailable)', color: '#f59e0b', disabled: true },
  { value: 'green-500', label: 'Green 500', color: '#22c55e' },
  { value: 'sky-500', label: 'Sky 500', color: '#0ea5e9' },
  { value: 'blue-500', label: 'Blue 500', color: '#3b82f6' },
  { value: 'violet-500', label: 'Violet 500', color: '#8b5cf6' },
  { value: 'pink-500', label: 'Pink 500', color: '#ec4899' },
];

const SPACING: SwatchItem[] = ['0', '1', '2', '3', '4', '6', '8', '12'].map((n) => ({ value: n, label: `Spacing ${n}`, content: n }));

/** Colour swatches and a spacing scale as selectable grids; hovering or focusing a cell previews it without choosing it. */
export class SwatchDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiSwatchGrid],
    template: html`
      <main class="mx-auto flex max-w-xl flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Swatch grid</h1>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Colours</h2>
          <ui-swatch-grid id="colors" [items]="colors" [(value)]="color" [columns]="3" label="Background colour" (hovered)="previewColor.set($event)"></ui-swatch-grid>
          <div class="flex items-center gap-3 text-sm">
            <span class="size-10 rounded-md border" id="preview" [attr.style]="previewStyle()"></span>
            <span>Chosen: <span id="chosen-color">{{ colorText() }}</span>. Previewing: <span id="previewing">{{ previewText() }}</span></span>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Spacing scale</h2>
          <ui-swatch-grid id="spacing" [items]="spacing" [(value)]="step" [columns]="4" label="Padding" cellClass="size-10"></ui-swatch-grid>
          <p class="text-sm text-muted-foreground">Chosen step: <span id="chosen-step">{{ stepText() }}</span></p>
        </section>
      </main>
    `,
  };

  colors = COLORS;
  spacing = SPACING;
  color = signal<string | null>('blue-500');
  step = signal<string | null>(null);
  previewColor = signal<string | null>(null);
  colorText = computed(() => this.color() ?? 'none');
  previewText = computed(() => this.previewColor() ?? 'nothing');
  stepText = computed(() => this.step() ?? 'none');
  previewStyle = computed(() => {
    const shown = this.previewColor() ?? this.color();
    const hex = COLORS.find((c) => c.value === shown)?.color;
    return hex ? `background-color: ${hex};` : '';
  });
}
