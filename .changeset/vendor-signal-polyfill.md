---
"@gable/core": patch
---

`@gable/core` no longer depends on the `signal-polyfill` npm package. A copy of its 0.2.2 source (upstream `1c33f91`) is vendored and compiled with core, so the private brand checks stay native instead of being lowered to `WeakSet` helpers (upstream's published build has no build target). Behaviour is unchanged; signal reads and writes are cheaper. To be removed once upstream releases the fix (proposal-signals/signal-polyfill#64).
