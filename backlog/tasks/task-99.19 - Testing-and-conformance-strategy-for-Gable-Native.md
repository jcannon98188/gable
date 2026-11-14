---
id: TASK-99.19
title: Testing and conformance strategy for Gable Native
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T23:22:00Z'
updated_date: '2026-11-07T23:29:00Z'
labels:
  - wayfinder:grilling
dependencies: []
parent_task_id: TASK-99
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How is Gable Native tested and kept correct: reuse of the existing Renderer conformance suite and the Test renderer, golden-image (visual regression) testing across GPUs and platforms, layout and style conformance (for example web-platform-tests subsets), text, input and IME testing, accessibility testing, media and canvas testing, performance and memory budgets, end-to-end tests on Windows, Linux, macOS and Android (emulator and device) in CI, and what can only be checked on CI macOS runners given the author cannot test on a Mac. Decide the layers, the gates and what blocks a release.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-07T23:29:00Z

---

Resolved with the user. Layers: (1) Rust unit tests (style, layout, text, display list, media state machine); (2) the existing Renderer conformance suite run against the native renderer; (3) a cross-renderer subset of the existing Gable suites (core, router, forms, store and others) run on the native renderer; (4) golden-image tests; (5) differential layout tests against the DOM renderer; (6) accessibility tree snapshots; (7) end-to-end smoke tests per platform; (8) performance budgets. Each layer is a blocking CI gate unless stated otherwise. JS tests in the host: a headless test host (the real host runtime with no window and software rendering) runs a bundled test file with a small runner implementing the TestApi (describe, it, expect) and reports JSON; a vitest wrapper spawns it per file so results appear in npm test; the conformance suite reads results through RendererHarness, so the host gets a test-only tree introspection API (tag, children, attributes, classes, styles, properties, event delivery) compiled out of production hosts. Golden images: the host renders offscreen to PNG; reference goldens use software rasterization on every platform for determinism; a smaller GPU smoke suite per platform has a looser tolerance and catches driver problems; tests use bundled fonts, never system fonts; goldens are per platform only where text rasterization legitimately differs; updating a golden is an explicit reviewed command and CI archives diffs; CI uses a software Vulkan driver on Linux, WARP on Windows and the runner's Metal or software path on macOS. Layout and style: a differential suite renders the same components (including real gable-ui components and Tailwind styles) with the DOM renderer in Chromium through Playwright and with native, comparing box rectangles, computed values for supported properties, text content and visibility, not pixels; a curated web-platform-tests CSS subset covers the supported features; expected failures live in a checked-in exclusions file with a reason per entry as with test262, including intentional deviations such as table lowering onto grid. Input and accessibility: key, pointer and text events are injected through the host test input API (shared with the Designer preview requirement); IME composition is injected as synthetic events covering host logic but not real platform IME behaviour; the AccessKit tree is dumped as JSON and snapshot-tested on every platform; a manual pre-release checklist covers real IMEs (Windows, macOS, Android keyboards), screen readers (Narrator, NVDA, VoiceOver, TalkBack, Orca), clipboard and drag. Platform CI: a matrix on Windows, Linux and macOS arm64 runs Rust tests, the headless conformance and golden suites and the accessibility snapshots; an Android emulator job (x86_64 with hardware acceleration on Linux) runs smoke end-to-end tests; real Android devices and macOS-only items CI cannot see are on the manual checklist; because the author cannot test on a Mac, pre-release macOS verification uses a hosted Mac session (menu bar, Cmd shortcuts, IME, notarized launch, VoiceOver) with CI screenshots archived as evidence. Performance and release: a native benchmark set runs on a fixed CI runner (scrolling a 10,000-row virtual list, startup to first frame, layout of 1,000 nodes, command buffer throughput, memory across mount and unmount cycles, a canvas draw test) against a stored baseline with a regression tolerance that fails the build; Android performance comes from periodic on-device runs and is not a CI gate; a release is blocked by any CI layer red on four OSes plus the Android emulator, unexplained conformance failures, performance outside budget, or an unsigned manual checklist; the engine has its own gates (test262 and the switch-over rule). macOS: hosted Mac session before releases; CI is otherwise the only macOS verification.

---
<!-- COMMENTS:END -->
