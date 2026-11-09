//! One engine, its main realm, the host primitives and the event loop.

use crate::engine_choice::EngineChoice;
use crate::host::HarnessHost;
use anyhow::{anyhow, bail, Result};
use gable_engine_api::{CallContext, Engine, Error, PromiseState, PropertyKey, RealmId, Value};
use std::cell::RefCell;
use std::path::Path;
use std::rc::Rc;
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Default)]
pub struct Options {
    /// Collect console output in [`Outcome::console`] instead of printing.
    pub capture_console: bool,
    /// Wall-clock limit for one `run_module`; the engine is interrupted
    /// when it passes. `None` means no limit.
    pub timeout: Option<Duration>,
}

/// What running a module produced.
#[derive(Clone, Debug, Default)]
pub struct Outcome {
    /// Console lines, when [`Options::capture_console`] is set.
    pub console: Vec<String>,
    /// Exceptions thrown by timer callbacks or jobs that nothing caught.
    pub uncaught: Vec<String>,
    /// Promises still rejected with no handler when the loop went idle.
    pub unhandled: Vec<String>,
    /// The module failed to load or evaluate, or never finished.
    pub error: Option<String>,
}

struct Timer {
    id: u32,
    due: f64,
    seq: u64,
    callback: Value,
    args: Vec<Value>,
    interval: Option<f64>,
}

#[derive(Default)]
struct Timers {
    next_id: u32,
    next_seq: u64,
    list: Vec<Timer>,
}

impl Timers {
    fn add(&mut self, now: f64, callback: Value, delay: f64, args: Vec<Value>, repeat: bool) -> u32 {
        // Node's clamping: a delay below 1 ms (or not a number) is 1 ms.
        let delay = if delay.is_finite() && delay >= 1.0 { delay.trunc() } else { 1.0 };
        self.next_id += 1;
        self.next_seq += 1;
        let id = self.next_id;
        self.list.push(Timer { id, due: now + delay, seq: self.next_seq, callback, args, interval: repeat.then_some(delay) });
        id
    }
    fn clear(&mut self, id: u32) {
        self.list.retain(|t| t.id != id);
    }
    fn next_index(&self) -> Option<usize> {
        (0..self.list.len()).min_by(|&a, &b| {
            let (x, y) = (&self.list[a], &self.list[b]);
            x.due.total_cmp(&y.due).then(x.seq.cmp(&y.seq))
        })
    }
}

/// A benchmark resolved from a bundle's `benchmarks` export.
pub struct Benchmark {
    run: Value,
    this: Value,
    state: Value,
}

pub struct Runtime {
    engine: Box<dyn Engine>,
    realm: RealmId,
    host: Rc<HarnessHost>,
    timers: Rc<RefCell<Timers>>,
    choice: EngineChoice,
    options: Options,
    uncaught: Vec<String>,
}

fn describe(e: &Error) -> String {
    e.to_string()
}

impl Runtime {
    pub fn new(choice: EngineChoice, options: Options) -> Result<Runtime> {
        let host = Rc::new(HarnessHost::new(options.capture_console));
        let engine = choice.make(host.clone());
        let realm = engine.main_realm();
        let timers = Rc::new(RefCell::new(Timers::default()));
        let mut rt = Runtime { engine, realm, host, timers, choice, options, uncaught: Vec::new() };
        rt.install_globals().map_err(|e| anyhow!("installing host globals: {e}"))?;
        Ok(rt)
    }

    pub fn engine(&mut self) -> &mut dyn Engine {
        self.engine.as_mut()
    }

    fn install_globals(&mut self) -> gable_engine_api::Result<()> {
        let realm = self.realm;
        let global = self.engine.global_object(realm)?;
        for (name, repeat) in [("setTimeout", false), ("setInterval", true)] {
            let timers = self.timers.clone();
            let host = self.host.clone();
            let f = self.engine.new_function(
                realm,
                name,
                Rc::new(move |e: &mut dyn Engine, ctx: CallContext| {
                    let callback = ctx.arg(0);
                    let delay = match ctx.arg(1) {
                        Value::Undefined => 0.0,
                        v => e.to_number(ctx.realm, &v)?,
                    };
                    let args = ctx.args.iter().skip(2).cloned().collect();
                    let id = timers.borrow_mut().add(host.clock.now(), callback, delay, args, repeat);
                    Ok(Value::Number(id as f64))
                }),
            )?;
            self.engine.set(realm, &global, &PropertyKey::from(name), &f)?;
        }
        for name in ["clearTimeout", "clearInterval"] {
            let timers = self.timers.clone();
            let f = self.engine.new_function(
                realm,
                name,
                Rc::new(move |_e: &mut dyn Engine, ctx: CallContext| {
                    if let Value::Number(n) = ctx.arg(0) {
                        timers.borrow_mut().clear(n as u32);
                    }
                    Ok(Value::Undefined)
                }),
            )?;
            self.engine.set(realm, &global, &PropertyKey::from(name), &f)?;
        }
        let performance = self.engine.new_object(realm)?;
        let host = self.host.clone();
        let now = self.engine.new_function(realm, "now", Rc::new(move |_e: &mut dyn Engine, _ctx: CallContext| Ok(Value::Number(host.clock.now()))))?;
        self.engine.set(realm, &performance, &PropertyKey::from("now"), &now)?;
        let origin = self.host.clock.epoch_ms() - self.host.clock.now();
        self.engine.set(realm, &performance, &PropertyKey::from("timeOrigin"), &Value::Number(origin))?;
        self.engine.set(realm, &global, &PropertyKey::from("performance"), &performance)?;
        if self.choice == EngineChoice::QuickJs {
            self.bind_quickjs_date(&global)?;
        }
        Ok(())
    }

    /// The QuickJS-NG adapter reads the system clock for `Date` instead of
    /// `Host::now_ms` (an interim-engine limitation), so skipped idle time
    /// would not show in `Date.now()`. Wrap `Date` onto the host clock there.
    fn bind_quickjs_date(&mut self, global: &Value) -> gable_engine_api::Result<()> {
        let realm = self.realm;
        let host = self.host.clone();
        let now = self.engine.new_function(realm, "now", Rc::new(move |_e: &mut dyn Engine, _ctx: CallContext| Ok(Value::Number(host.clock.epoch_ms()))))?;
        self.engine.set(realm, global, &PropertyKey::from("__harnessNow"), &now)?;
        self.engine.eval_script(
            realm,
            "harness-date.js",
            r#"(() => {
                const now = globalThis.__harnessNow;
                delete globalThis.__harnessNow;
                const RealDate = Date;
                function HarnessDate(...args) {
                    if (!new.target) return new RealDate(now()).toString();
                    return Reflect.construct(RealDate, args.length ? args : [now()], new.target);
                }
                HarnessDate.prototype = RealDate.prototype;
                Object.defineProperty(RealDate.prototype, "constructor", { value: HarnessDate, writable: true, configurable: true });
                HarnessDate.now = now;
                HarnessDate.parse = RealDate.parse;
                HarnessDate.UTC = RealDate.UTC;
                Object.defineProperty(HarnessDate, "name", { value: "Date" });
                Object.defineProperty(globalThis, "Date", { value: HarnessDate, writable: true, configurable: true });
            })();"#,
        )?;
        Ok(())
    }

    fn drain_jobs(&mut self) {
        while self.engine.has_pending_jobs() {
            if let Err(e) = self.engine.run_jobs(self.realm) {
                if matches!(e, Error::Interrupted) {
                    return;
                }
                self.uncaught.push(describe(&e));
            }
        }
    }

    fn interrupted(&self) -> bool {
        self.host.deadline.get().is_some_and(|d| Instant::now() >= d)
    }

    /// Run jobs and timers until nothing is left, or until `done` reports
    /// true after a turn.
    fn run_loop(&mut self, mut done: impl FnMut(&mut Runtime) -> bool) {
        loop {
            self.drain_jobs();
            if self.interrupted() || done(self) {
                return;
            }
            let timer = {
                let mut timers = self.timers.borrow_mut();
                let Some(i) = timers.next_index() else { return };
                let now = self.host.clock.now();
                let due = timers.list[i].due;
                if due > now {
                    self.host.clock.skip(due - now);
                }
                match timers.list[i].interval {
                    Some(every) => {
                        let seq = timers.next_seq + 1;
                        timers.next_seq = seq;
                        let t = &mut timers.list[i];
                        t.due = due + every;
                        t.seq = seq;
                        (t.callback.clone(), t.args.clone())
                    }
                    None => {
                        let t = timers.list.swap_remove(i);
                        (t.callback, t.args)
                    }
                }
            };
            let (callback, args) = timer;
            if let Err(e) = self.engine.call(self.realm, &callback, &Value::Undefined, &args) {
                if matches!(e, Error::Interrupted) {
                    return;
                }
                self.uncaught.push(describe(&e));
            }
        }
    }

    fn arm_deadline(&self) {
        self.host.deadline.set(self.options.timeout.map(|t| Instant::now() + t));
    }

    fn stringify(&mut self, v: &Value) -> String {
        if let Value::Object(_) = v {
            // Prefer the stack (Error objects), then String(v).
            if let Ok(Value::String(s)) = self.engine.get(self.realm, v, &PropertyKey::from("stack")) {
                if !s.is_empty() {
                    let text = s.to_string_lossy();
                    let head = self.engine.to_string(self.realm, v).unwrap_or_default();
                    return if text.starts_with(&head) { text } else { format!("{head}\n{text}") };
                }
            }
        }
        self.engine.to_string(self.realm, v).unwrap_or_else(|e| format!("<unprintable: {e}>"))
    }

    /// Load `path` as a module, run the event loop to idle and report.
    pub fn run_module(&mut self, path: &Path) -> Result<Outcome> {
        self.arm_deadline();
        let mut outcome = Outcome::default();
        let spec = path.to_string_lossy().into_owned();
        match self.engine.load_module(self.realm, &spec) {
            Err(e) => outcome.error = Some(describe(&e)),
            Ok(promise) => {
                self.run_loop(|_| false);
                if self.interrupted() {
                    outcome.error = Some(format!("timed out after {:?}", self.options.timeout.unwrap_or_default()));
                } else {
                    match self.engine.promise_state(self.realm, &promise) {
                        Ok(PromiseState::Rejected(reason)) => {
                            outcome.error = Some(self.stringify(&reason));
                            self.forget_rejection(&promise);
                        }
                        Ok(PromiseState::Pending) => {
                            outcome.error = Some("the module never finished evaluating (a top-level await never settled)".into())
                        }
                        Ok(PromiseState::Fulfilled(_)) => {}
                        Err(e) => outcome.error = Some(describe(&e)),
                    }
                }
            }
        }
        self.host.deadline.set(None);
        self.finish(&mut outcome);
        Ok(outcome)
    }

    fn forget_rejection(&mut self, promise: &Value) {
        let list = std::mem::take(&mut *self.host.rejections.borrow_mut());
        let kept = list.into_iter().filter(|(p, _)| !self.engine.strict_equals(p, promise)).collect();
        *self.host.rejections.borrow_mut() = kept;
    }

    fn finish(&mut self, outcome: &mut Outcome) {
        outcome.uncaught.append(&mut self.uncaught);
        let rejected = std::mem::take(&mut *self.host.rejections.borrow_mut());
        for (_, reason) in rejected {
            let text = self.stringify(&reason);
            outcome.unhandled.push(text);
        }
        outcome.console.append(&mut self.host.console.borrow_mut());
    }

    /// Run the loop until `promise` settles (or nothing is left to run).
    fn await_value(&mut self, value: Value) -> Result<Value> {
        if !self.engine.is_promise(&value) {
            self.drain_jobs();
            return Ok(value);
        }
        let p = value.clone();
        self.run_loop(move |rt| !matches!(rt.engine.promise_state(rt.realm, &p), Ok(PromiseState::Pending)));
        match self.engine.promise_state(self.realm, &value).map_err(|e| anyhow!("{e}"))? {
            PromiseState::Fulfilled(v) => Ok(v),
            PromiseState::Rejected(r) => {
                self.forget_rejection(&value);
                bail!("{}", self.stringify(&r))
            }
            PromiseState::Pending => bail!("promise never settled"),
        }
    }

    /// Load a module and return its namespace object.
    pub fn load_namespace(&mut self, path: &Path) -> Result<Value> {
        self.arm_deadline();
        let spec = path.to_string_lossy().into_owned();
        let promise = self.engine.load_module(self.realm, &spec).map_err(|e| anyhow!("{e}"))?;
        let ns = self.await_value(promise);
        self.host.deadline.set(None);
        ns
    }

    fn benchmarks_object(&mut self, ns: &Value) -> Result<Value> {
        let b = self.engine.get(self.realm, ns, &PropertyKey::from("benchmarks")).map_err(|e| anyhow!("{e}"))?;
        if !matches!(b, Value::Object(_)) {
            bail!("the module has no `benchmarks` export");
        }
        Ok(b)
    }

    pub fn benchmark_names(&mut self, ns: &Value) -> Result<Vec<String>> {
        let b = self.benchmarks_object(ns)?;
        let keys = self.engine.own_keys(self.realm, &b).map_err(|e| anyhow!("{e}"))?;
        Ok(keys
            .into_iter()
            .filter_map(|k| match k {
                PropertyKey::String(s) => Some(s.to_string_lossy()),
                PropertyKey::Symbol(_) => None,
            })
            .collect())
    }

    /// Resolve `name` in the `benchmarks` export and run its `setup`.
    pub fn benchmark(&mut self, ns: &Value, name: &str) -> Result<Benchmark> {
        let b = self.benchmarks_object(ns)?;
        let this = self.engine.get(self.realm, &b, &PropertyKey::from(name)).map_err(|e| anyhow!("{e}"))?;
        if !matches!(this, Value::Object(_)) {
            bail!("no benchmark named {name}");
        }
        let run = self.engine.get(self.realm, &this, &PropertyKey::from("run")).map_err(|e| anyhow!("{e}"))?;
        let setup = self.engine.get(self.realm, &this, &PropertyKey::from("setup")).map_err(|e| anyhow!("{e}"))?;
        let state = if setup.is_undefined() {
            Value::Undefined
        } else {
            let v = self.engine.call(self.realm, &setup, &this, &[]).map_err(|e| anyhow!("{name} setup: {e}"))?;
            self.await_value(v)?
        };
        Ok(Benchmark { run, this, state })
    }

    /// Run one iteration (call `run(state)`, await it, drain the loop) and
    /// return the result as a string, the checksum.
    pub fn run_benchmark_iteration(&mut self, b: &mut Benchmark) -> Result<String> {
        let v = self
            .engine
            .call(self.realm, &b.run, &b.this, std::slice::from_ref(&b.state))
            .map_err(|e| anyhow!("{e}"))?;
        let v = self.await_value(v)?;
        Ok(self.stringify(&v))
    }
}
