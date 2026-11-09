//! Which engine Gable runs.
//!
//! The Gable engine is the default (switch-over, TASK-100.10: spec section 11
//! conditions 1, 2 and 4 hold). The interim QuickJS-NG engine stays
//! selectable for one release after the switch (condition 5), then this
//! choice and the adapter dependency go away.

use gable_engine_api::{Engine, Host};
use std::rc::Rc;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum EngineChoice {
    /// The Gable engine (`gable-js-vm`).
    #[default]
    Gable,
    /// The interim engine (the QuickJS-NG adapter). Selectable for one
    /// release after the switch-over.
    QuickJs,
}

impl EngineChoice {
    pub const ALL: [EngineChoice; 2] = [EngineChoice::Gable, EngineChoice::QuickJs];

    /// The name used on command lines and in result files, matching the
    /// test262 runner's and the micro-benchmark harness's `--engine`.
    pub fn name(self) -> &'static str {
        match self {
            EngineChoice::Gable => "gable",
            EngineChoice::QuickJs => "quickjs",
        }
    }

    pub fn parse(name: &str) -> Option<EngineChoice> {
        EngineChoice::ALL.into_iter().find(|e| e.name() == name)
    }

    /// True for the interim engine, which is kept only for one release.
    pub fn is_interim(self) -> bool {
        self == EngineChoice::QuickJs
    }

    pub fn make(self, host: Rc<dyn Host>) -> Box<dyn Engine> {
        match self {
            EngineChoice::Gable => gable_js_vm::make_engine(host),
            EngineChoice::QuickJs => gable_engine_quickjs::make_engine(host),
        }
    }
}
