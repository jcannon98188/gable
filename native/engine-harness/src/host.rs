//! The harness's `Host`: modules from disk, a skippable clock, console
//! routing, rejection tracking and a wall-clock interrupt.

use gable_engine_api::{ConsoleLevel, Engine, Host, ModuleSource, RealmId, RejectionEvent, Value};
use std::cell::{Cell, RefCell};
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// Monotonic clock with an offset the event loop advances to skip idle waits.
pub struct Clock {
    start: Instant,
    epoch_at_start: f64,
    skew_ms: Cell<f64>,
}

impl Clock {
    pub fn new() -> Clock {
        let epoch = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0);
        Clock { start: Instant::now(), epoch_at_start: epoch, skew_ms: Cell::new(0.0) }
    }
    /// Milliseconds since the clock started, including skipped time.
    pub fn now(&self) -> f64 {
        self.start.elapsed().as_secs_f64() * 1000.0 + self.skew_ms.get()
    }
    pub fn epoch_ms(&self) -> f64 {
        (self.epoch_at_start + self.now()).floor()
    }
    pub fn skip(&self, ms: f64) {
        if ms > 0.0 {
            self.skew_ms.set(self.skew_ms.get() + ms);
        }
    }
}

pub struct HarnessHost {
    pub clock: Clock,
    pub capture_console: bool,
    pub console: RefCell<Vec<String>>,
    /// Promises rejected with no handler, with their reasons.
    pub rejections: RefCell<Vec<(Value, Value)>>,
    pub deadline: Cell<Option<Instant>>,
}

impl HarnessHost {
    pub fn new(capture_console: bool) -> HarnessHost {
        HarnessHost {
            clock: Clock::new(),
            capture_console,
            console: RefCell::new(Vec::new()),
            rejections: RefCell::new(Vec::new()),
            deadline: Cell::new(None),
        }
    }
}

fn resolve_path(referrer: Option<&str>, specifier: &str) -> PathBuf {
    let p = Path::new(specifier);
    match referrer {
        Some(r) if specifier.starts_with("./") || specifier.starts_with("../") => {
            Path::new(r).parent().unwrap_or(Path::new(".")).join(p)
        }
        _ => p.to_path_buf(),
    }
}

impl Host for HarnessHost {
    fn resolve_module(
        &self,
        referrer: Option<&str>,
        specifier: &str,
        _attributes: &[gable_engine_api::ImportAttribute],
    ) -> Result<String, String> {
        let path = resolve_path(referrer, specifier);
        let path = std::fs::canonicalize(&path).map_err(|e| format!("cannot resolve {specifier}: {e}"))?;
        let s = path.to_string_lossy();
        // Windows verbatim prefix: keep names readable in stack traces.
        Ok(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string())
    }

    fn load_module(&self, resolved: &str) -> Result<ModuleSource, String> {
        let text = std::fs::read_to_string(resolved).map_err(|e| format!("cannot read {resolved}: {e}"))?;
        if resolved.ends_with(".json") {
            Ok(ModuleSource::Json(text))
        } else {
            Ok(ModuleSource::Source(text))
        }
    }

    fn promise_rejection(&self, engine: &mut dyn Engine, _realm: RealmId, event: RejectionEvent) {
        let mut list = self.rejections.borrow_mut();
        match event {
            RejectionEvent::Reject { promise, reason } => list.push((promise, reason)),
            RejectionEvent::Handle { promise } => {
                if let Some(i) = list.iter().position(|(p, _)| engine.strict_equals(p, &promise)) {
                    list.remove(i);
                }
            }
        }
    }

    fn console(&self, _realm: RealmId, level: ConsoleLevel, args: Vec<String>) {
        let line = args.join(" ");
        if self.capture_console {
            self.console.borrow_mut().push(line);
            return;
        }
        match level {
            ConsoleLevel::Warn | ConsoleLevel::Error => eprintln!("{line}"),
            _ => println!("{line}"),
        }
    }

    fn interrupt(&self) -> bool {
        self.deadline.get().is_some_and(|d| Instant::now() >= d)
    }

    fn now_ms(&self) -> f64 {
        self.clock.epoch_ms()
    }
}
