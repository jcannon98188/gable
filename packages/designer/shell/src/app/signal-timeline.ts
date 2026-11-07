// The drawer's State timeline tab (TASK-56.18): the selected frame's recorded signal writes, newest first, a slider to scrub
// through the states, Replay, Live, Pause/Record and Clear. Choosing a step (row, slider) travels the frame's app there.
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import { UiButton } from "../components/ui/button.js";
import { UiSlider } from "../components/ui/slider.js";
import { SignalTimeline } from "./signal-timeline-state.js";

const MAX_SHOWN_WRITES = 4;

export class SignalTimelineTab {
  static meta = {
    selector: "app-signal-timeline",
    host: { class: "block" },
    imports: [UiButton, UiSlider],
    template: html`
      <div class="dbar">
        <span class="dim" data-part="history-summary">{{ view().summary }}</span>
        <span class="spacer"></span>
        <button uiButton variant="outline" size="sm" class="btn sm" data-part="history-replay" [disabled]="view().none" (click)="toggleReplay()">{{ view().replayLabel }}</button>
        <button uiButton variant="outline" size="sm" class="btn sm" data-part="history-live" [disabled]="view().live" (click)="live()">Live</button>
        <button uiButton variant="outline" size="sm" class="btn sm" data-part="history-record" [attr.aria-pressed]="view().recording" (click)="toggleRecord()">{{ view().recordLabel }}</button>
        <button uiButton variant="outline" size="sm" class="btn sm" data-part="history-clear" [disabled]="view().none" (click)="clear()">Clear</button>
      </div>
      @if (view().show) {
        @if (!view().none) {
          <div class="flex items-center gap-3 px-3 py-2" data-part="history-scrub">
            <!-- TODO(gable-ui): ui-slider has no label input for its thumb (ui-range-slider has labels); the text beside it names it. -->
            <span class="mono dim shrink-0" data-part="history-position">{{ view().position }}</span>
            <div class="min-w-0 flex-1"><ui-slider [(value)]="position" [min]="0" [max]="view().max" [step]="1"></ui-slider></div>
          </div>
        }
        @if (view().note) {
          <p [attr.class]="view().noteClass" role="status" data-part="history-note">{{ view().note }}</p>
        }
        @if (view().dropped) {
          <p class="callout info" data-part="history-dropped">{{ view().dropped }}</p>
        }
        @if (!view().recording) {
          <p class="callout info" data-part="history-paused">Recording is paused: the app's writes are not recorded until Record.</p>
        }
        @for (s of view().steps; track s.seq) {
          <button type="button" class="tbl-row w-full grid-cols-[60px_minmax(0,1fr)_auto] text-left hover:bg-muted/40" data-part="history-step" [attr.data-seq]="s.seq" [attr.data-current]="s.current" [attr.aria-current]="s.ariaCurrent" (click)="travel(s.seq)">
            <span class="mono dim">{{ s.time }}</span>
            <span class="mono truncate" [attr.title]="s.title">{{ s.writes }}</span>
            <span class="wrap">
              @if (s.designer) {
                <span class="chip">Designer</span>
              }
              @if (s.current) {
                <span class="chip on">shown</span>
              }
            </span>
          </button>
        }
        @if (!view().none) {
          <button type="button" class="tbl-row w-full grid-cols-[60px_minmax(0,1fr)_auto] text-left hover:bg-muted/40" data-part="history-start" [attr.data-current]="view().atStart" (click)="travel(view().start)">
            <span class="mono dim">start</span>
            <span class="dim">The state before the first recorded step</span>
            <span class="wrap">
              @if (view().atStart) {
                <span class="chip on">shown</span>
              }
            </span>
          </button>
        }
        @if (view().none) {
          <div class="empty"><strong>No state changes recorded yet</strong>Use the app (Interact mode) or set a signal in the Inspector: every write to a signal appears here, and choosing one puts the app back to that state.</div>
        }
      } @else {
        <div class="empty"><strong>Not connected</strong>The timeline shows the selected frame's state history once its app is running with the Gable devtools hook.</div>
      }
    `,
  };
  timeline = inject(SignalTimeline);
  /** The slider: 0 is the state before the first step, i the state after the i-th kept step. */
  position = signal(0);
  /** The position the frame shows now (set from the history, so the slider does not travel back to it). */
  #shown = 0;
  #scrubTimer: ReturnType<typeof setTimeout> | undefined;

  view = computed(() => {
    const info = this.timeline.info();
    const steps = info?.steps ?? [];
    const first = steps[0]?.seq ?? 1;
    const cursor = info?.cursor ?? null;
    const writes = steps.reduce((n, s) => n + s.writes.length, 0);
    const note = this.timeline.note();
    const index = cursor === null ? steps.length : steps.findIndex((s) => s.seq === cursor) + 1;
    return {
      show: !!info,
      note: note?.text ?? "",
      noteClass: note?.kind === "err" ? "callout err" : "callout warn",
      none: steps.length === 0,
      recording: info?.recording ?? false,
      recordLabel: info?.recording ? "Pause" : "Record",
      replayLabel: this.timeline.replaying() ? "Stop" : "Replay",
      live: cursor === null,
      atStart: cursor === first - 1,
      start: first - 1,
      max: steps.length,
      index,
      position: index === 0 ? "start" : `step ${steps[index - 1]!.seq}${cursor === null ? " (live)" : ""}`,
      summary: !info ? "" : steps.length === 0 ? "Nothing recorded" : `${steps.length} step${steps.length === 1 ? "" : "s"}, ${writes} write${writes === 1 ? "" : "s"}, newest first`,
      dropped: info?.dropped ? `${info.dropped} older step${info.dropped === 1 ? " was" : "s were"} dropped: the timeline keeps the last ${info.maxSteps} steps and ${info.maxWrites} writes.` : "",
      steps: [...steps].reverse().map((s) => {
        const shown = s.writes.slice(0, MAX_SHOWN_WRITES).map((w) => `${w.name} ${w.before.s} → ${w.after.s}`);
        const rest = s.writes.length - shown.length + s.more;
        const current = s.seq === cursor || (cursor === null && s.seq === steps.at(-1)!.seq);
        return {
          seq: s.seq,
          time: `${(s.at / 1000).toFixed(2)}s`,
          writes: shown.join(", ") + (rest > 0 ? ` and ${rest} more` : ""),
          title: s.writes.map((w) => `${w.owner ? `${w.owner}.` : ""}${w.name}: ${w.before.s} → ${w.after.s}`).join("\n"),
          designer: s.source === "designer",
          current,
          ariaCurrent: current ? "step" : null,
        };
      }),
    };
  });

  /** The history moved (a new step, a travel): the slider follows without travelling. */
  follow = effect(() => {
    const index = this.view().index;
    untracked(() => {
      this.#shown = index;
      this.position.set(index);
    });
  });

  /** The slider moved: travel there once it rests for a moment. */
  scrub = effect(() => {
    const p = this.position();
    untracked(() => {
      clearTimeout(this.#scrubTimer);
      if (p === this.#shown) return;
      this.#scrubTimer = setTimeout(() => {
        const steps = this.timeline.info()?.steps ?? [];
        if (!steps.length) return;
        this.timeline.stopReplay();
        void this.timeline.travel(p === 0 ? steps[0]!.seq - 1 : steps[Math.min(p, steps.length) - 1]!.seq);
      }, 120);
    });
  });

  travel(seq: number): void {
    this.timeline.stopReplay();
    void this.timeline.travel(seq);
  }

  live(): void {
    this.timeline.stopReplay();
    void this.timeline.live();
  }

  toggleReplay(): void {
    if (this.timeline.replaying()) this.timeline.stopReplay();
    else void this.timeline.replay();
  }

  toggleRecord(): void {
    void this.timeline.record(!this.view().recording);
  }

  clear(): void {
    void this.timeline.clear();
  }
}
