---
id: TASK-99.2
title: Embeddable JS engines for desktop and Android
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T21:37:00Z'
updated_date: '2026-11-07T21:42:00Z'
labels:
  - wayfinder:research
dependencies: []
parent_task_id: TASK-99
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Which JS engines can run Gable apps (the TS-transpiled app, TC39 Signals polyfill, RxJS, the no-eval template interpreter) embedded in a native host on Windows, macOS, Linux and Android: V8 (rusty_v8), QuickJS, Hermes, JavaScriptCore, Boa and others? For each: ES feature coverage, performance, binary size, debugging and inspector support, hot-update hooks for HMR, embedding APIs, licensing, and macOS and Android availability. Facts and comparison, not a decision.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T21:42:00Z

---

Research resolved. Findings on branch `research/embeddable-js-engines` (research/embeddable-js-engines.md). V8 via rusty_v8 (15.2, MIT) has prebuilt libs for Windows, macOS and Linux (about 37-38 MB gzipped each) but none for Android (source cross-build only), a JIT with a jitless mode, and an inspector API; a macOS JIT needs the hardened-runtime JIT entitlement (unverified). QuickJS and QuickJS-NG (MIT) are tiny interpreters with near-full ES2025, Android marked limited testing, no Intl, no inspector found. Hermes is AOT bytecode with no ES module loader, Intl off by default, missing features (Temporal, local eval, with), and ships via React Native since 2024. JavaScriptCore is a system framework on macOS only; Windows and Android builds are community or abandoned, and licensing is LGPL-mixed. Boa (Rust, MIT) is 96% test262 but experimental with no inspector. No engine has a built-in HMR API; all offer script or module evaluation plus precompiled-code loading. Gaps: no independent performance, binary-size, memory or startup numbers; Hermes outside React Native, JSC on Windows and Android, and SpiderMonkey on macOS and Android unconfirmed.

---
<!-- COMMENTS:END -->
