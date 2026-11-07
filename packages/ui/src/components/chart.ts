import { computed, html, injectHost, input, signal } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";

/** One data series: the row key it reads, the name shown in the tooltip, legend and table, and an optional colour. */
export interface ChartSeries {
  key: string;
  label?: string;
  /** Any CSS colour. Defaults to the theme's `--chart-1` .. `--chart-5`, in order. */
  color?: string;
}

export type ChartType = "line" | "area" | "bar" | "pie" | "donut";

const PALETTE = 5;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 44 };
const SLICE_GAP = 0;
const TOOLTIP_HALF = 80;

/** Rounds for SVG output so paths stay short and tests stable. */
const r = (n: number): number => Math.round(n * 100) / 100;
const fmt = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** A round axis range and its tick values (steps of 1, 2 or 5 times a power of ten). */
export function niceScale(min: number, max: number, count = 5): { lo: number; hi: number; ticks: number[] } {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (lo === hi) hi = lo + 1;
  const rough = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const res = rough / mag;
  const step = (res <= 1 ? 1 : res <= 2 ? 2 : res <= 5 ? 5 : 10) * mag;
  lo = Math.floor(lo / step + 1e-9) * step;
  hi = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo, i = 0; v <= hi + step / 1e6 && i < 100; v += step, i++) ticks.push(Math.round(v / step) * step);
  return { lo, hi, ticks };
}

/** SVG path of a pie slice (`inner` 0) or donut segment between two angles in radians. */
function arcPath(cx: number, cy: number, inner: number, outer: number, a0: number, a1: number): string {
  const full = a1 - a0 >= Math.PI * 2 - 1e-6;
  const end = full ? a0 + Math.PI * 2 - 1e-4 : a1;
  const large = end - a0 > Math.PI ? 1 : 0;
  const p = (radius: number, angle: number) => `${r(cx + radius * Math.cos(angle))} ${r(cy + radius * Math.sin(angle))}`;
  let d = `M ${p(outer, a0)} A ${r(outer)} ${r(outer)} 0 ${large} 1 ${p(outer, end)}`;
  d += inner > 0 ? ` L ${p(inner, end)} A ${r(inner)} ${r(inner)} 0 ${large} 0 ${p(inner, a0)} Z` : ` L ${r(cx)} ${r(cy)} Z`;
  return d;
}

/**
 * A themed chart drawn as SVG, with no charting dependency (shadcn's Chart wraps Recharts, which is React-only).
 *
 *   <ui-chart type="bar" label="Visitors by month" [data]="rows" xKey="month" [series]="series" [height]="280"></ui-chart>
 *
 *   rows = [{ month: "January", desktop: 186, mobile: 80 }, ...];
 *   series = [{ key: "desktop", label: "Desktop" }, { key: "mobile", label: "Mobile" }];
 *
 * `type` is `line`, `area`, `bar`, `pie` or `donut`. Cartesian charts read one value per series from each row, with the
 * row's `xKey` as the category. Pie and donut charts use the first series for slice sizes and `xKey` for slice names.
 * Series without a `color` take `--chart-1` .. `--chart-5` from `@gable/ui/theme.css`, so charts follow light and dark.
 * The width follows the element (a `ResizeObserver`); `height` is fixed. Scales are linear from zero with round ticks.
 * `stacked` stacks the series of bar and area charts (negative values stack downwards from zero; ignored for line, pie and
 * donut). In a cartesian chart each legend entry is a toggle button (`aria-pressed`, Space/Enter) that hides or shows
 * that series; the last visible series cannot be hidden. Lines, areas, bars and slices fade or scale in when they first
 * appear (`animate`, on by default); the animation is off under `prefers-reduced-motion`.
 * Not supported: a secondary axis, zoom, toggling pie slices.
 *
 * Accessibility: the chart is a labelled group (`aria-roledescription="chart"`; a focusable child may not sit inside
 * `role="img"`). Every category (or slice) is one point that reads its values aloud, e.g. "March: Desktop 237, Mobile 120".
 * The points share one tab stop; Left/Right (and Up/Down), Home and End move between them, and focusing or hovering a
 * point shows the tooltip (Escape hides it). The same numbers are available as a visually hidden table. The tooltip itself is
 * `aria-hidden` because the point already announces it.
 */
export class UiChart {
  static meta = {
    selector: "ui-chart",
    template: html`
      <div class="relative">
        <svg
          role="group"
          aria-roledescription="chart"
          [attr.aria-label]="label()"
          [attr.viewBox]="viewBox()"
          [attr.width]="width()"
          [attr.height]="height()"
          class="block max-w-full overflow-visible"
        >
          @if (cartesian()) {
            @for (t of axis().ticks; track t.label) {
              @if (showGrid()) {
                <line [attr.x1]="t.x1" [attr.x2]="t.x2" [attr.y1]="t.y" [attr.y2]="t.y" class="stroke-border" stroke-dasharray="3 3"></line>
              }
              <text [attr.x]="t.labelX" [attr.y]="t.labelY" text-anchor="end" class="fill-muted-foreground text-xs">{{ t.label }}</text>
            }
            @for (x of axis().xLabels; track x.index) {
              <text [attr.x]="x.x" [attr.y]="x.y" text-anchor="middle" class="fill-muted-foreground text-xs">{{ x.label }}</text>
            }
            <line [attr.x1]="axis().baseline.x1" [attr.x2]="axis().baseline.x2" [attr.y1]="axis().baseline.y" [attr.y2]="axis().baseline.y" class="stroke-border"></line>
            @if (cursor()) {
              <line [attr.x1]="cursor().x" [attr.x2]="cursor().x" [attr.y1]="cursor().y1" [attr.y2]="cursor().y2" class="stroke-muted-foreground/40" stroke-dasharray="3 3"></line>
            }
            @for (b of bars(); track b.key) {
              <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="3" [attr.fill]="b.color" [attr.fill-opacity]="b.opacity" [attr.style]="b.origin" [attr.class]="enterClass()"></rect>
            }
            @for (l of lines(); track l.key) {
              <g [attr.class]="enterClass()">
                @if (l.area) {
                  <path [attr.d]="l.areaPath" [attr.fill]="l.color" fill-opacity="0.2"></path>
                }
                <path [attr.d]="l.path" [attr.stroke]="l.color" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
              </g>
            }
            @for (d of dots(); track d.key) {
              <circle [attr.cx]="d.x" [attr.cy]="d.y" r="4" [attr.fill]="d.color" class="stroke-background" stroke-width="2"></circle>
            }
            @for (p of columns(); track p.index) {
              <rect
                data-chart-point
                role="img"
                [attr.aria-label]="p.label"
                [attr.tabindex]="p.tabindex"
                [attr.x]="p.x"
                [attr.y]="p.y"
                [attr.width]="p.w"
                [attr.height]="p.h"
                fill="transparent"
                class="outline-none focus-visible:stroke-ring focus-visible:stroke-2"
                (pointerenter)="show(p.index)"
                (pointerleave)="hide()"
                (focus)="show(p.index)"
                (blur)="hide()"
                (keydown)="onKey($event)"
              ></rect>
            }
          } @else {
            @for (s of slices(); track s.index) {
              <path
                data-chart-point
                role="img"
                [attr.aria-label]="s.label"
                [attr.tabindex]="s.tabindex"
                [attr.d]="s.path"
                [attr.fill]="s.color"
                [attr.fill-opacity]="s.opacity"
                [attr.class]="sliceClasses()"
                stroke-width="2"
                (pointerenter)="show(s.index)"
                (pointerleave)="hide()"
                (focus)="show(s.index)"
                (blur)="hide()"
                (keydown)="onKey($event)"
              ></path>
            }
            @if (centre()) {
              <text [attr.x]="centre().x" [attr.y]="centre().y1" text-anchor="middle" class="fill-foreground text-2xl font-bold">{{ centre().value }}</text>
              <text [attr.x]="centre().x" [attr.y]="centre().y2" text-anchor="middle" class="fill-muted-foreground text-xs">{{ centre().caption }}</text>
            }
          }
        </svg>
        @if (tooltip()) {
          <div
            aria-hidden="true"
            data-chart-tooltip
            [attr.style]="tooltip().style"
            class="pointer-events-none absolute z-10 grid min-w-32 -translate-x-1/2 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
          >
            <div class="font-medium">{{ tooltip().title }}</div>
            @for (row of tooltip().rows; track row.label) {
              <div class="flex items-center gap-2">
                <span class="size-2.5 shrink-0 rounded-[2px]" [attr.style]="row.swatch"></span>
                <span class="text-muted-foreground">{{ row.label }}</span>
                <span class="ml-auto pl-4 font-mono font-medium text-foreground tabular-nums">{{ row.value }}</span>
              </div>
            }
          </div>
        }
      </div>
      @if (showLegend()) {
        <ul class="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs" data-chart-legend>
          @for (item of legend(); track item.key) {
            <li>
              @if (cartesian()) {
                <button type="button" data-chart-legend-item [attr.aria-pressed]="item.pressed" [attr.class]="item.classes" (click)="toggle(item.key)">
                  <span class="size-2 shrink-0 rounded-[2px]" [attr.style]="item.swatch"></span>
                  {{ item.label }}
                </button>
              } @else {
                <span class="flex items-center gap-1.5">
                  <span class="size-2 shrink-0 rounded-[2px]" [attr.style]="item.swatch"></span>
                  {{ item.label }}
                </span>
              }
            </li>
          }
        </ul>
      }
      <table class="sr-only" data-chart-table>
        <caption>{{ label() }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ xKey() }}</th>
            @for (h of table().headers; track h) {
              <th scope="col">{{ h }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of table().rows; track row.index) {
            <tr>
              <th scope="row">{{ row.name }}</th>
              @for (cell of row.cells; track cell.index) {
                <td>{{ cell.text }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    `,
  };

  /** The accessible name of the chart; also the caption of the data table. */
  label = input<string>("Chart");
  type = input<ChartType>("line");
  /** One object per category (or slice). */
  data = input<Record<string, unknown>[]>([]);
  /** The row key holding the category name. */
  xKey = input<string>("name");
  series = input<ChartSeries[]>([]);
  /** Chart height in pixels. */
  height = input<number>(300);
  showGrid = input<boolean>(true);
  showLegend = input<boolean>(true);
  /** Stacks the series of bar and area charts. */
  stacked = input<boolean>(false);
  /** Animates the marks in when they first appear (not under `prefers-reduced-motion`). */
  animate = input<boolean>(true);
  /** Hole size of a donut as a fraction of the radius. */
  innerRadius = input<number>(0.6);
  /** Caption under the total in the middle of a donut. */
  totalLabel = input<string>("Total");
  class = input<string>("");

  /** The measured width; a fixed one until the element has been laid out. */
  width = signal(600);
  /** Keys of the series hidden through the legend. */
  private hidden = signal<ReadonlySet<string>>(new Set());
  /** The point (category or slice) being hovered or focused. */
  active = signal<number | null>(null);
  /** The point that holds the tab stop: the last one shown, so leaving the chart and coming back returns to it. */
  private roving = signal(0);

  private hostRef = injectHost<HTMLElement>();
  private classes = useHostClass(() => cn("block w-full text-foreground", this.class()));
  private observe = (() => {
    const host = this.hostRef.host as HTMLElement | undefined;
    const RO = host?.ownerDocument?.defaultView?.ResizeObserver;
    if (!RO || !host) return;
    const read = (w: number) => {
      if (w > 0 && Math.round(w) !== this.width()) this.width.set(Math.round(w));
    };
    const observer = new RO((entries) => read(entries[entries.length - 1]?.contentRect.width ?? host.clientWidth));
    observer.observe(host);
    currentScope()?.onDispose(() => observer.disconnect());
    queueMicrotask(() => read(host.clientWidth));
  })();

  cartesian = computed(() => this.type() === "line" || this.type() === "area" || this.type() === "bar");
  viewBox = computed(() => `0 0 ${this.width()} ${this.height()}`);

  private seriesList = computed(() =>
    this.series().map((s, i) => ({ key: s.key, label: s.label ?? s.key, color: s.color ?? `var(--chart-${(i % PALETTE) + 1})` })),
  );
  /** The series that are drawn (all but the ones hidden through the legend). */
  private shown = computed(() => this.seriesList().filter((s) => !this.hidden().has(s.key)));
  private stackOn = computed(() => this.stacked() && (this.type() === "bar" || this.type() === "area"));
  enterClass = computed(() => (this.animate() ? "animate-in fade-in-0 duration-700 motion-reduce:animate-none" : ""));
  sliceClasses = computed(() => cn("stroke-background outline-none focus-visible:stroke-ring focus-visible:stroke-2", this.enterClass()));
  /** Stacked: per series key, the segment [from, to] of every category. */
  private stack = computed(() => {
    const out = new Map<string, { from: number; to: number }[]>();
    const cats = this.categories();
    const pos = cats.map(() => 0);
    const neg = cats.map(() => 0);
    for (const s of this.shown()) {
      out.set(
        s.key,
        cats.map((c, i) => {
          const v = num(c.row[s.key]);
          const acc = v >= 0 ? pos : neg;
          const from = acc[i]!;
          acc[i] = from + v;
          return { from, to: acc[i]! };
        }),
      );
    }
    return out;
  });
  private categories = computed(() => this.data().map((row, i) => ({ index: i, name: String(row[this.xKey()] ?? ""), row })));
  /** Pie and donut slices: one per row with a positive value in the first series. */
  private pieRows = computed(() => {
    const first = this.seriesList()[0];
    const rows = this.categories().map((c) => ({ ...c, value: first ? Math.max(0, num(c.row[first.key])) : 0 }));
    const total = rows.reduce((sum, c) => sum + c.value, 0);
    return { rows, total, valueLabel: first?.label ?? "" };
  });
  private swatch = (color: string) => `background-color: ${color}`;

  private geometry = computed(() => {
    const w = this.width();
    const h = this.height();
    const plot = { left: MARGIN.left, top: MARGIN.top, width: Math.max(10, w - MARGIN.left - MARGIN.right), height: Math.max(10, h - MARGIN.top - MARGIN.bottom) };
    const all = this.stackOn()
      ? [...this.stack().values()].flatMap((segments) => segments.flatMap((seg) => [seg.from, seg.to]))
      : this.categories().flatMap((c) => this.shown().map((s) => num(c.row[s.key])));
    const scale = niceScale(all.length ? Math.min(...all) : 0, all.length ? Math.max(...all) : 1);
    const n = this.categories().length;
    const step = n ? plot.width / n : plot.width;
    const y = (v: number) => r(plot.top + plot.height * (1 - (v - scale.lo) / (scale.hi - scale.lo)));
    const x = (i: number) => r(plot.left + step * (i + 0.5));
    return { plot, scale, n, step, y, x, y0: y(0) };
  });

  axis = computed(() => {
    const { plot, scale, n, step, y, x } = this.geometry();
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plot.width / 64))));
    return {
      ticks: scale.ticks.map((t) => ({ label: fmt(t), y: y(t), x1: plot.left, x2: plot.left + plot.width, labelX: plot.left - 8, labelY: y(t) + 4 })),
      xLabels: this.categories()
        .filter((c) => c.index % every === 0)
        .map((c) => ({ index: c.index, label: c.name, x: x(c.index), y: plot.top + plot.height + 18 })),
      baseline: { x1: plot.left, x2: plot.left + plot.width, y: y(0) },
      step,
    };
  });

  lines = computed(() => {
    if (this.type() === "bar") return [];
    const { x, y, y0 } = this.geometry();
    const area = this.type() === "area";
    const stack = this.stackOn() ? this.stack() : null;
    return this.shown().map((s) => {
      const segs = stack?.get(s.key);
      const top = (i: number) => (segs ? y(segs[i]!.to) : y(num(this.categories()[i]!.row[s.key])));
      const pts = this.categories().map((c) => `${x(c.index)} ${top(c.index)}`);
      const path = pts.length ? `M ${pts.join(" L ")}` : "";
      const first = this.categories().length ? x(0) : 0;
      const last = this.categories().length ? x(this.categories().length - 1) : 0;
      let areaPath = "";
      if (path) {
        if (segs) {
          const back = this.categories().map((c) => `${x(c.index)} ${y(segs[c.index]!.from)}`).reverse();
          areaPath = `${path} L ${back.join(" L ")} Z`;
        } else areaPath = `${path} L ${last} ${y0} L ${first} ${y0} Z`;
      }
      return { key: s.key, color: s.color, area, path, areaPath };
    });
  });

  bars = computed(() => {
    if (this.type() !== "bar") return [];
    const { x, y, y0, step } = this.geometry();
    const list = this.shown();
    const group = step * 0.8;
    const each = Math.max(1, group / Math.max(1, list.length) - 2);
    const active = this.active();
    const stack = this.stackOn() ? this.stack() : null;
    const stackWidth = Math.max(1, group - 2);
    return this.categories().flatMap((c) =>
      list.map((s, si) => {
        const seg = stack?.get(s.key)?.[c.index];
        const a = seg ? y(seg.from) : y0;
        const b = seg ? y(seg.to) : y(num(c.row[s.key]));
        const w = stack ? stackWidth : each;
        const offset = stack ? x(c.index) - stackWidth / 2 : x(c.index) - group / 2 + si * (group / list.length) + 1;
        return {
          key: `${c.index}:${s.key}`,
          x: r(offset),
          y: Math.min(a, b),
          w: r(w),
          h: r(Math.abs(a - b)),
          color: s.color,
          opacity: active === null || active === c.index ? 1 : 0.5,
          // Bars grow from the baseline (the end that sits on zero).
          origin: `transform-box: fill-box; transform-origin: 50% ${b <= a ? "100%" : "0%"}`,
        };
      }),
    );
  });

  /** The marker on the point under the pointer or focus, one per series. */
  dots = computed(() => {
    const active = this.active();
    if (active === null || this.type() === "bar" || !this.cartesian()) return [];
    const c = this.categories()[active];
    if (!c) return [];
    const { x, y } = this.geometry();
    const stack = this.stackOn() ? this.stack() : null;
    return this.shown().map((s) => {
      const seg = stack?.get(s.key)?.[active];
      return { key: s.key, x: x(active), y: seg ? y(seg.to) : y(num(c.row[s.key])), color: s.color };
    });
  });

  cursor = computed(() => {
    const active = this.active();
    if (active === null || this.type() === "bar" || !this.categories()[active]) return null;
    const { plot, x } = this.geometry();
    return { x: x(active), y1: plot.top, y2: plot.top + plot.height };
  });

  /** One focusable, labelled column per category. */
  columns = computed(() => {
    const { plot, step, x } = this.geometry();
    const rovingTo = this.roving();
    const list = this.shown();
    return this.categories().map((c) => ({
      index: c.index,
      x: r(x(c.index) - step / 2),
      y: plot.top,
      w: r(step),
      h: plot.height,
      tabindex: c.index === rovingTo ? 0 : -1,
      label: `${c.name}: ${list.map((s) => `${s.label} ${fmt(num(c.row[s.key]))}`).join(", ")}`,
    }));
  });

  private pieGeometry = computed(() => {
    const w = this.width();
    const h = this.height();
    const outer = Math.max(10, Math.min(w, h) / 2 - 8);
    return { cx: r(w / 2), cy: r(h / 2), outer, inner: this.type() === "donut" ? outer * Math.min(0.9, Math.max(0.1, this.innerRadius())) : 0 };
  });

  slices = computed(() => {
    if (this.cartesian()) return [];
    const { rows, total, valueLabel } = this.pieRows();
    const { cx, cy, outer, inner } = this.pieGeometry();
    const active = this.active();
    const rovingTo = this.roving();
    let angle = -Math.PI / 2;
    return rows.map((c) => {
      const span = total > 0 ? (c.value / total) * Math.PI * 2 : 0;
      const a0 = angle;
      angle += span;
      const mid = (a0 + angle) / 2;
      const rm = (outer + inner) / 2;
      const pct = total > 0 ? Math.round((c.value / total) * 1000) / 10 : 0;
      return {
        index: c.index,
        path: span > 0 ? arcPath(cx, cy, inner, outer, a0 + SLICE_GAP, angle) : "",
        color: `var(--chart-${(c.index % PALETTE) + 1})`,
        opacity: active === null || active === c.index ? 1 : 0.6,
        tabindex: c.index === rovingTo ? 0 : -1,
        label: `${c.name}: ${valueLabel} ${fmt(c.value)} (${fmt(pct)}%)`,
        mx: r(cx + rm * Math.cos(mid)),
        my: r(cy + rm * Math.sin(mid)),
      };
    });
  });

  /** The total in the middle of a donut. */
  centre = computed(() => {
    if (this.type() !== "donut") return null;
    const { cx, cy } = this.pieGeometry();
    return { x: cx, y1: cy + 6, y2: cy + 24, value: fmt(this.pieRows().total), caption: this.totalLabel() };
  });

  tooltip = computed(() => {
    const active = this.active();
    if (active === null) return null;
    const c = this.categories()[active];
    if (!c) return null;
    const clamp = (px: number) => Math.min(Math.max(px, TOOLTIP_HALF), Math.max(TOOLTIP_HALF, this.width() - TOOLTIP_HALF));
    if (this.cartesian()) {
      const { x, plot } = this.geometry();
      return {
        title: c.name,
        style: `left: ${clamp(x(active))}px; top: ${plot.top}px`,
        rows: this.shown().map((s) => ({ label: s.label, value: fmt(num(c.row[s.key])), swatch: this.swatch(s.color) })),
      };
    }
    const slice = this.slices()[active];
    const { rows, total, valueLabel } = this.pieRows();
    const value = rows[active]?.value ?? 0;
    const pct = total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
    return {
      title: c.name,
      style: `left: ${clamp(slice?.mx ?? 0)}px; top: ${slice?.my ?? 0}px`,
      rows: [{ label: `${valueLabel} (${fmt(pct)}%)`, value: fmt(value), swatch: this.swatch(slice?.color ?? "") }],
    };
  });

  legend = computed(() =>
    this.cartesian()
      ? this.seriesList().map((s) => {
          const off = this.hidden().has(s.key);
          return {
            key: s.key,
            label: s.label,
            swatch: this.swatch(s.color),
            pressed: off ? "false" : "true",
            classes: cn("flex items-center gap-1.5 rounded-sm px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring", off && "opacity-50"),
          };
        })
      : this.categories().map((c) => ({ key: String(c.index), label: c.name, swatch: this.swatch(`var(--chart-${(c.index % PALETTE) + 1})`), pressed: "true", classes: "" })),
  );

  /** The data as a table for screen readers. */
  table = computed(() => {
    const list = this.cartesian() ? this.seriesList() : this.seriesList().slice(0, 1);
    return {
      headers: list.map((s) => s.label),
      rows: this.categories().map((c) => ({ index: c.index, name: c.name, cells: list.map((s, i) => ({ index: i, text: fmt(num(c.row[s.key])) })) })),
    };
  });

  /** Hides or shows a series (the legend's toggle). The last visible series stays. */
  toggle(key: string): void {
    const next = new Set(this.hidden());
    if (next.has(key)) next.delete(key);
    else if (this.shown().length > 1) next.add(key);
    else return;
    this.hidden.set(next);
  }

  show(index: number): void {
    this.active.set(index);
    this.roving.set(index);
  }
  hide(): void {
    this.active.set(null);
  }

  onKey(event: KeyboardEvent): void {
    const count = this.categories().length;
    if (event.key === "Escape") return this.hide();
    const current = this.active() ?? 0;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? Math.min(count - 1, current + 1)
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? Math.max(0, current - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    const host = this.hostRef.host;
    const points = typeof host?.querySelectorAll === "function" ? [...host.querySelectorAll<SVGElement>("[data-chart-point]")] : [];
    this.active.set(next);
    points[next]?.focus();
  }
}
