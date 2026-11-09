//! The harness runtime seen from outside: load a module file into a fresh
//! engine, run the event loop to idle, and read back what it printed. Every
//! test runs on both engines, because the harness must behave the same on
//! the interim engine and the Gable engine.

use gable_engine_harness::{EngineChoice, Options, Runtime};
use std::path::PathBuf;

fn module(name: &str, source: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("gable-harness-tests-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(name);
    std::fs::write(&path, source).unwrap();
    path
}

fn run(engine: EngineChoice, name: &str, source: &str) -> Vec<String> {
    let path = module(&format!("{}-{name}", engine.name()), source);
    let mut rt = Runtime::new(engine, Options { capture_console: true, ..Options::default() }).unwrap();
    let outcome = rt.run_module(&path).unwrap();
    assert!(outcome.error.is_none(), "{:?}", outcome.error);
    outcome.console
}

fn both(name: &str, source: &str, expected: &[&str]) {
    for engine in EngineChoice::ALL {
        assert_eq!(run(engine, name, source), expected, "engine {}", engine.name());
    }
}

#[test]
fn default_engine_is_the_gable_engine_and_quickjs_stays_selectable() {
    assert_eq!(EngineChoice::default(), EngineChoice::Gable);
    assert_eq!(EngineChoice::parse("gable"), Some(EngineChoice::Gable));
    assert_eq!(EngineChoice::parse("quickjs"), Some(EngineChoice::QuickJs));
    assert_eq!(EngineChoice::parse("v8"), None);
}

#[test]
fn timers_fire_in_due_order_after_microtasks() {
    both(
        "order.mjs",
        r#"
        setTimeout(() => console.log("t20"), 20);
        setTimeout(() => console.log("t0"), 0);
        setTimeout(() => console.log("t10"), 10);
        Promise.resolve().then(() => console.log("micro"));
        console.log("sync");
        "#,
        &["sync", "micro", "t0", "t10", "t20"],
    );
}

#[test]
fn equal_delays_fire_in_scheduling_order_and_args_are_passed() {
    both(
        "args.mjs",
        r#"
        setTimeout((a, b) => console.log("a", a, b), 5, 1, 2);
        setTimeout(() => console.log("b"), 5);
        "#,
        &["a 1 2", "b"],
    );
}

#[test]
fn cleared_timers_do_not_fire_and_intervals_repeat_until_cleared() {
    both(
        "clear.mjs",
        r#"
        const t = setTimeout(() => console.log("never"), 1);
        clearTimeout(t);
        let n = 0;
        const i = setInterval(() => { n++; console.log("tick " + n); if (n === 3) clearInterval(i); }, 10);
        "#,
        &["tick 1", "tick 2", "tick 3"],
    );
}

#[test]
fn idle_waits_are_skipped_but_the_clock_still_advances() {
    let start = std::time::Instant::now();
    both(
        "skip.mjs",
        r#"
        const t0 = performance.now();
        const d0 = Date.now();
        setTimeout(() => {
            const dt = performance.now() - t0;
            const dd = Date.now() - d0;
            console.log(dt >= 5000 && dt < 6000 ? "perf ok" : "perf " + dt);
            console.log(dd >= 4999 && dd < 6000 ? "date ok" : "date " + dd);
        }, 5000);
        "#,
        &["perf ok", "date ok"],
    );
    assert!(start.elapsed().as_secs() < 4, "the 5 s wait was not skipped");
}

#[test]
fn top_level_await_on_a_timer_completes() {
    both(
        "tla.mjs",
        r#"
        await new Promise((r) => setTimeout(r, 50));
        console.log("after");
        "#,
        &["after"],
    );
}

#[test]
fn a_throwing_timer_is_reported_and_the_loop_continues() {
    for engine in EngineChoice::ALL {
        let path = module(
            &format!("{}-throw.mjs", engine.name()),
            r#"
            setTimeout(() => { throw new Error("boom"); }, 1);
            setTimeout(() => console.log("still running"), 2);
            "#,
        );
        let mut rt = Runtime::new(engine, Options { capture_console: true, ..Options::default() }).unwrap();
        let outcome = rt.run_module(&path).unwrap();
        assert_eq!(outcome.console, ["still running"], "engine {}", engine.name());
        assert_eq!(outcome.uncaught.len(), 1, "engine {}", engine.name());
        assert!(outcome.uncaught[0].contains("boom"), "{:?}", outcome.uncaught);
    }
}

#[test]
fn unhandled_rejections_are_counted_and_late_handlers_cancel_them() {
    for engine in EngineChoice::ALL {
        let path = module(
            &format!("{}-reject.mjs", engine.name()),
            r#"
            Promise.reject(new Error("lost"));
            const late = Promise.reject(new Error("caught later"));
            setTimeout(() => late.catch(() => console.log("handled")), 1);
            "#,
        );
        let mut rt = Runtime::new(engine, Options { capture_console: true, ..Options::default() }).unwrap();
        let outcome = rt.run_module(&path).unwrap();
        assert_eq!(outcome.console, ["handled"], "engine {}", engine.name());
        assert_eq!(outcome.unhandled.len(), 1, "engine {}: {:?}", engine.name(), outcome.unhandled);
        assert!(outcome.unhandled[0].contains("lost"));
    }
}

#[test]
fn a_module_that_throws_reports_the_error() {
    for engine in EngineChoice::ALL {
        let path = module(&format!("{}-bad.mjs", engine.name()), "throw new TypeError('bad module');");
        let mut rt = Runtime::new(engine, Options { capture_console: true, ..Options::default() }).unwrap();
        let outcome = rt.run_module(&path).unwrap();
        let err = outcome.error.expect("error");
        assert!(err.contains("bad module"), "{err}");
    }
}

#[test]
fn module_exports_are_reachable_for_benchmarks() {
    for engine in EngineChoice::ALL {
        let path = module(
            &format!("{}-bench.mjs", engine.name()),
            r#"
            export const benchmarks = {
                sum: { setup() { return { n: 0 }; }, run(s) { s.n += 1; return s.n * 10; } },
                later: { async run() { await new Promise((r) => setTimeout(r, 1)); return "done"; } },
            };
            "#,
        );
        let mut rt = Runtime::new(engine, Options::default()).unwrap();
        let ns = rt.load_namespace(&path).unwrap();
        let mut b = rt.benchmark(&ns, "sum").unwrap();
        assert_eq!(rt.run_benchmark_iteration(&mut b).unwrap(), "10");
        assert_eq!(rt.run_benchmark_iteration(&mut b).unwrap(), "20");
        let mut l = rt.benchmark(&ns, "later").unwrap();
        assert_eq!(rt.run_benchmark_iteration(&mut l).unwrap(), "done");
        assert!(rt.benchmark(&ns, "missing").is_err());
        assert_eq!(rt.benchmark_names(&ns).unwrap(), ["sum", "later"]);
    }
}
