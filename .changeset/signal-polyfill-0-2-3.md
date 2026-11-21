---
"@gablejs/core": patch
---

`@gablejs/core` now depends on `signal-polyfill` 0.2.3. That release builds for ES2022, so the private brand checks stay native instead of being lowered to `WeakSet` helpers (0.2.2 had no build target). Behaviour is unchanged; signal reads, writes and signal construction are cheaper.
