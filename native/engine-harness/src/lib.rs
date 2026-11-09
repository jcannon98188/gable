//! A minimal Gable-side embedder for running Gable's own JavaScript test
//! suites and benchmarks inside an engine behind `gable-engine-api`.
//!
//! The Host runtime does not exist yet; until it does, this crate is where
//! Gable chooses an engine ([`EngineChoice`]), and it supplies the host
//! primitives the suites need: timers, a clock, `performance.now`, module
//! loading from disk and an event loop that runs jobs and then timers. The
//! rest of the WinterCG globals are JavaScript stand-ins (`js/host-prelude.js`)
//! bundled into each suite.
//!
//! The loop skips idle waits: when nothing is runnable and the next timer is
//! in the future, the clock jumps to it instead of sleeping. Time stays
//! monotonic and consistent between `Date.now()`, `performance.now()` and
//! timer delays, so code that measures elapsed time sees the delays it asked
//! for, but a suite with a 5 second timeout does not take 5 seconds.

mod engine_choice;
mod host;
mod runtime;

pub use engine_choice::EngineChoice;
pub use runtime::{Benchmark, Options, Outcome, Runtime};
