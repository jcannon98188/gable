// Per-frame phase timing for a canvas boundary, measured from outside the renderer: the boundary's frame loop runs
// Frame.advance (hooks), then flushSync (effects write to Pixi nodes), then Application.render. So the three phases are
//   hooks  = duration of Frame.advance
//   flush  = end of advance to start of render (flushSync plus the renderer's own per-frame redraw work)
//   render = duration of Application.render (Pixi's submit)
// Shared by the browser page and the Node microbench. Install before the boundary mounts, uninstall after.
import { Frame, type ApplicationLike, type FrameScheduler } from "@gable/renderer-pixi";

export interface Series {
  hooks: number[];
  flush: number[];
  render: number[];
  /** Time between successive animation frames, as the scheduler's timestamps report it (only meaningful with a real rAF). */
  frame: number[];
}

export interface Summary {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
}

export function percentile(xs: ArrayLike<number>, p: number): number {
  const sorted = Array.from(xs).sort((a, b) => a - b);
  if (!sorted.length) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

export function summarize(xs: ArrayLike<number>): Summary {
  const a = Array.from(xs);
  return { p50: percentile(a, 50), p95: percentile(a, 95), p99: percentile(a, 99), mean: a.reduce((s, v) => s + v, 0) / (a.length || 1) };
}

export class Recorder {
  readonly series: Series = { hooks: [], flush: [], render: [], frame: [] };
  /** Called once when `total` frames have been recorded. */
  onDone: (() => void) | null = null;
  #advanceStart = 0;
  #advanceEnd = 0;
  #renderStart = 0;
  #renderEnd = 0;
  #lastStamp: number | null = null;
  #original: Frame["advance"] | null = null;

  constructor(
    readonly total: number,
    readonly now: () => number = () => performance.now(),
  ) {}

  /** Patches `Frame.prototype.advance` to time the hook phase. */
  install(): void {
    if (this.#original) return;
    const original = (this.#original = Frame.prototype.advance);
    const self = this;
    Frame.prototype.advance = function (this: Frame, seconds: number) {
      self.#advanceStart = self.now();
      try {
        original.call(this, seconds);
      } finally {
        self.#advanceEnd = self.now();
      }
    };
  }

  uninstall(): void {
    if (this.#original) Frame.prototype.advance = this.#original;
    this.#original = null;
  }

  /** Wraps an Application so its `render` is timed and the frame is recorded when the render returns. */
  wrapApplication<A extends ApplicationLike>(app: A): A {
    const render = app.render.bind(app);
    app.render = () => {
      this.#renderStart = this.now();
      try {
        render();
      } finally {
        this.#renderEnd = this.now();
        this.#record();
      }
    };
    return app;
  }

  /** Wraps a scheduler so the time between frames is recorded from the timestamps it delivers. */
  wrapScheduler(inner: FrameScheduler): FrameScheduler {
    return {
      cancel: (id) => inner.cancel(id),
      request: (cb) =>
        inner.request((time) => {
          if (this.#lastStamp !== null) this.series.frame.push(time - this.#lastStamp);
          this.#lastStamp = time;
          cb(time);
        }),
    };
  }

  #record(): void {
    const s = this.series;
    if (s.hooks.length >= this.total) return;
    s.hooks.push(this.#advanceEnd - this.#advanceStart);
    s.flush.push(this.#renderStart - this.#advanceEnd);
    s.render.push(this.#renderEnd - this.#renderStart);
    if (s.hooks.length === this.total) this.onDone?.();
  }
}

export interface PhaseSummaries {
  hooksMs: Summary;
  flushMs: Summary;
  renderMs: Summary;
  jsTotalMs: Summary;
  frameMs: Summary;
  dropped: number;
}

/** Summarises the measured frames, dropping the first `warm` as warm-up. */
export function summarizeSeries(series: Series, warm: number, refreshMs = 1000 / 60): PhaseSummaries {
  const cut = (xs: number[]) => xs.slice(warm);
  const hooks = cut(series.hooks);
  const flush = cut(series.flush);
  const render = cut(series.render);
  const frame = series.frame.slice(Math.max(warm - 1, 0));
  return {
    hooksMs: summarize(hooks),
    flushMs: summarize(flush),
    renderMs: summarize(render),
    jsTotalMs: summarize(hooks.map((v, i) => v + flush[i]! + render[i]!)),
    frameMs: summarize(frame),
    dropped: frame.filter((d) => d > refreshMs * 1.5).length,
  };
}
