// How long an element's exit animation or transition takes, read from its computed style.
// Shared by route transitions (transition.ts) and @gable/ui-primitives presence via @gable/core/internal.

const ms = (token: string) => (token.endsWith("ms") ? parseFloat(token) : parseFloat(token) * 1000) || 0;
const list = (value: string | undefined) => (value ?? "").split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
const TIME = /^-?[\d.]+m?s$/;
export type ComputedStyleLike = Record<string, string | undefined> & { getPropertyValue?(name: string): string };

/** One animation or transition of a computed style: delay and duration in ms, iteration count (Infinity for `infinite`). */
interface Timing {
  duration: number;
  delay: number;
  count: number;
  none: boolean;
}

/** Longhands first; a style that only exposes the shorthand (jsdom, happy-dom) is parsed from that. */
function timings(cs: ComputedStyleLike, kind: "animation" | "transition"): Timing[] {
  const durations = list(cs[kind + "Duration"]);
  if (durations.length > 0) {
    const delays = list(cs[kind + "Delay"]);
    const counts = list(cs.animationIterationCount);
    const names = kind === "animation" ? list(cs.animationName) : [];
    return durations.map((d, i) => ({
      duration: ms(d),
      delay: ms(delays[i % Math.max(delays.length, 1)] ?? "0s"),
      count: kind === "animation" ? (counts[i % Math.max(counts.length, 1)] === "infinite" ? Infinity : parseFloat(counts[i % Math.max(counts.length, 1)] ?? "1") || 1) : 1,
      none: kind === "animation" && (names[i % Math.max(names.length, 1)] ?? "none") === "none",
    }));
  }
  return list(cs.getPropertyValue?.(kind) ?? cs[kind]).map((item) => {
    const words = item.split(/\s+(?![^(]*\))/);
    const times = words.filter((w) => TIME.test(w));
    const iter = words.find((w) => w === "infinite" || /^\d+(\.\d+)?$/.test(w));
    return { duration: ms(times[0] ?? "0s"), delay: ms(times[1] ?? "0s"), count: iter === "infinite" ? Infinity : iter ? parseFloat(iter) : 1, none: item === "none" };
  });
}

/** Longest animation or transition on `host` according to its computed style, in ms (Infinity for an endless animation); null when it has none or there is no DOM. */
export function computedExitDuration(host: unknown): number | null {
  const g = globalThis as unknown as { getComputedStyle?: (el: unknown) => ComputedStyleLike };
  if (!g.getComputedStyle || (host as { nodeType?: number } | null)?.nodeType !== 1) return null;
  const cs = g.getComputedStyle(host);
  let longest = -1;
  for (const t of timings(cs, "animation")) if (!t.none && t.duration + t.delay > 0) longest = Math.max(longest, t.delay + t.duration * t.count);
  for (const t of timings(cs, "transition")) if (!t.none && t.duration > 0) longest = Math.max(longest, t.delay + t.duration);
  return longest < 0 ? null : longest;
}
