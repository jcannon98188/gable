// RxJS pipelines as Gable apps use them (HTTP-shaped streams, debounced
// input, store effects): synchronous operator chains over many values.
import { from, of, range, Subject } from "rxjs";
import { bufferCount, distinctUntilChanged, filter, map, mergeMap, scan, switchMap, takeLast } from "rxjs/operators";

export const benchmarks = {
  /** map / filter / scan / distinct over 100k values. */
  "rxjs-operators": {
    run() {
      let out = 0;
      range(0, 100_000)
        .pipe(
          map((x) => x * 3),
          filter((x) => x % 2 === 0),
          scan((acc, x) => (acc + x) % 1_000_003, 0),
          distinctUntilChanged(),
          takeLast(1),
        )
        .subscribe((v) => (out = v));
      return String(out);
    },
  },
  /** Higher-order: mergeMap and switchMap into inner observables. */
  "rxjs-higher-order": {
    run() {
      let out = 0;
      range(0, 5_000)
        .pipe(
          mergeMap((x) => of(x, x + 1)),
          switchMap((x) => from([x, x * 2])),
          bufferCount(10),
          map((b) => b.reduce((a, x) => a + x, 0)),
        )
        .subscribe((v) => (out = (out + v) % 1_000_003));
      return String(out);
    },
  },
  /** A Subject fanned out to many subscribers, pushed many times. */
  "rxjs-subject-fanout": {
    run() {
      const s = new Subject<number>();
      let out = 0;
      for (let i = 0; i < 100; i++) s.pipe(map((x) => x + i)).subscribe((v) => (out = (out + v) % 1_000_003));
      for (let i = 0; i < 1_000; i++) s.next(i);
      s.complete();
      return String(out);
    },
  },
};
