# Accessibility bridging across the four platforms (TASK-99.4)

Question: how can an own-drawn UI expose an accessibility tree on Windows (UIA), macOS (NSAccessibility), Linux (AT-SPI) and Android (AccessibilityNodeInfo)? Assess AccessKit and alternatives: coverage per platform, maturity, what the framework must supply (roles, names, focus, live regions), and how Gable `LiveAnnouncer` and `FocusManager` would map. Facts and comparison only, no decision.

All sources fetched 2026-11-07. Many pages were read through a summarising fetch; claims taken from a fetch that could not show the primary text are marked "(unverified)" and should be re-checked before they become spec rules. Apple's developer pages returned no body text, so Apple-side claims come from AccessKit source or are marked unverified. No Mac was available, so no macOS behaviour was observed; everything about VoiceOver is from documents and issue reports.

## 1. What each platform requires of an own-drawn UI

All four platforms expect the app to publish a tree of "virtual" accessible elements for content the OS cannot see (it only sees one window or view). The shared shape: element identity, role, name, bounds, state, actions, focus, and change notifications.

| Platform | API the app implements | Primary source |
|---|---|---|
| Windows | UI Automation server-side provider: custom controls implement provider interfaces and control patterns; a fragment root is hosted in an HWND; client views are raw, control and content | https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-providersoverview |
| macOS | NSAccessibility protocol on the view; `NSAccessibilityElement` for non-view elements (role, label, frame, parent). Apple's page returned no text; the `NSAccessibilityElement` description is unverified general knowledge | https://developer.apple.com/documentation/appkit/nsaccessibilityelement |
| Linux | AT-SPI over D-Bus; `at-spi2-core` provides interface definitions, the registry daemon (`registryd`) and the session accessibility bus. The app (or toolkit) exports accessible objects on the bus | https://gitlab.gnome.org/GNOME/at-spi2-core |
| Android | `AccessibilityNodeProvider` (API 16) returns an `AccessibilityNodeInfo` per virtual view id (`createAccessibilityNodeInfo`, `performAction`, `findFocus`); installed via `View.getAccessibilityNodeProvider()` or an `AccessibilityDelegate`. Android recommends `ExploreByTouchHelper` for the Views system | https://developer.android.com/reference/android/view/accessibility/AccessibilityNodeProvider |

Cross-cutting facts from those sources:
- Windows: without a provider, a custom control is "largely opaque" and only the HWND frame is visible (UIA providers overview).
- Android: the stated use case for `AccessibilityNodeProvider` is "a custom view that draws complex content ... presented as a tree of logical nodes" (reference page). Jetpack Compose has its own `Modifier.semantics` model (role, label, state, actions) for Compose UIs; that is not applicable to a non-Compose own-drawn surface.
- Announcements differ per platform: UIA has an explicit notification API `UiaRaiseNotificationEvent` (Windows 10 1709+, takes a display string, NotificationKind, NotificationProcessing and an activity id) plus live-region changed events; Android has `android:accessibilityLiveRegion` (none, polite, assertive) and pane titles; macOS has `NSAccessibilityAnnouncementRequestedNotification` (priority medium or high, confirmed through AccessKit's source, section 2).

## 2. AccessKit (Rust, MIT OR Apache-2.0)

Sources: https://github.com/AccessKit/accesskit (README, ARCHITECTURE.md, adapter sources, CHANGELOGs), https://accesskit.dev/, docs.rs.

### Model
- A schema of a node tree: each node has an integer id, a `Role` (182 variants in accesskit 0.25.2, closely following Chromium's abstraction and ARIA), and optional properties. Role-to-property and role-to-action mappings are "loosely documented" (ARCHITECTURE.md).
- Push model: the toolkit sends a full tree first, then incremental `TreeUpdate`s with `nodes` (new or changed, each replacing the previous node wholesale, so unchanged fields must be resent), optional `tree` info, `tree_id` and `focus` (https://docs.rs/accesskit/latest/accesskit/struct.TreeUpdate.html). `focus` must be supplied with every update and names the focused node, or the root if none. Adding or removing a child means sending the parent with its updated `children`. Immediate-mode toolkits can use it if they supply stable ids per element (accesskit.dev how-it-works).
- Properties relevant here (docs.rs `Node`): `label`, `labelled_by`, `description`, `described_by`, `state_description`, `bounds`, `transform`, `text_selection` and per-character geometry for text, `active_descendant`, `live` (Off, Polite, Assertive), `live_atomic`, `busy`, disabled and hidden flags.
- Actions the AT can request (22 in 0.25.2): Click, Focus, Blur, Collapse, Expand, Increment, Decrement, ScrollDown/Left/Right/Up, ScrollIntoView, ScrollToPoint, SetScrollOffset, SetTextSelection, SetSequentialFocusNavigationStartingPoint, SetValue, ReplaceSelectedText, ShowContextMenu, Show/HideTooltip, CustomAction. The adapter calls back into an `ActionHandler` with an `ActionRequest` (action, target tree, target node, optional data).
- Multiple subtrees joined by graft nodes (since 0.23.0).
- `accesskit_consumer` holds the shared in-memory tree and update logic.

### Adapters, released versions and status
All five adapters are described as being at "rough feature parity", not covering all element types or schema properties, but supporting non-trivial apps including single-line and multi-line text inputs. Rich text and hypertext are not supported. A web adapter (for canvas-rendered UIs) is planned, not released (README).

| Platform | Crate | Version (2026-10-25) | Mechanism | Notes from source |
|---|---|---|---|---|
| Windows | `accesskit_windows` | 0.35.2 | UIA provider answering `WM_GETOBJECT` | States Inactive, Placeholder, Active; tree is built lazily on first `WM_GETOBJECT`. `update_if_active` and focus updates callable on any thread; `QueuedEvents::raise` must run on the window's thread. `SubclassingAdapter` exists for windows you cannot add message handling to. |
| macOS | `accesskit_macos` | 0.27.2 | NSAccessibility protocols on an `NSView` | `Adapter::new` must be called on the main thread (uses `MainThreadMarker`); action handler always runs on the main thread; holds only a weak reference to the view; lazy activation with a placeholder window node; `SubclassingAdapter` uses dynamic Objective-C subclassing; helper for SDL-style windows that hold focus |
| Linux | `accesskit_unix` | 0.24.1 | AT-SPI over D-Bus (zbus, `atspi` crate) | Blocking API with an internal async executor (default, or a `tokio` feature); handlers are "always called from another thread"; `set_root_window_bounds` only meaningful under X11, not Wayland. Crate docs listed as 0% documented on docs.rs |
| Android | `accesskit_android` | 0.9.1 (first release 0.1.0 on 2025-03-06) | JNI to the Java accessibility API | Two layers: low-level `Adapter` (caller writes the glue) and `InjectingAdapter`, which installs a Java `Delegate` as the host View's accessibility delegate and hover listener at runtime and panics if the view already has one. Needs the Java class `dev.accesskit.android.Delegate` (embeddable as a precompiled `.dex` via the `embedded-dex` feature). Default build is `arm64-v8a` only. Has had 5 breaking releases (0.2, 0.3, 0.5, 0.6, 0.7) in 12 months. Live region support landed in 0.9.0 (2026-09-25) |
| iOS (out of scope) | `accesskit_ios` | 0.2.2 | UIAccessibility | Listed for completeness |

Integration layer: `accesskit_winit` 0.34.2 wraps the adapters for winit; on Android it works only with winit's GameActivity, not the other activity implementation (winit adapter README). It does nothing on unsupported platforms but still compiles. C bindings (`accesskit-c`, cbindgen header, Win32 and SDL examples) and Python bindings (PyO3) exist, so a non-Rust host is possible (README). Other languages need those bindings or serialisation of the schema (accesskit.dev).

Maturity indicators:
- Release cadence is active: all eight crates released 2026-10-25; core crate 0.25.2, with 0.25.0 (2026-08-29) and 0.23.0 (2026-01-15) containing breaking changes. Pre-1.0 and semver-breaking releases are common.
- Integrated by Bevy, egui, Freya, Slint and Xilem (accesskit.dev). Slint's winit backend maps its item tree to an AccessKit node tree (docs.rs source of i-slint-backend-winit 1.9.2).
- Testing guidance in the repo is manual: VoiceOver and Orca instructions, with caveats that Accessibility Inspector, Accerciser and KDE's inspector can mislead and that VMs often garble audio or intercept screen reader keys (README-APPLICATION-DEVELOPERS.md). NVDA and Narrator are not covered in that file.

### What the framework must supply when using AccessKit
From ARCHITECTURE.md and the update rules: build and send `TreeUpdate`s (roles, names, bounds, state, actions) with stable node ids; re-specify every property on each changed node; keep `focus` in every update; handle `ActionRequest`s; supply window focus state, window bounds and activation callbacks to the adapter; and own the threading (which differs per platform, see the table). If the initial-tree activation handler returns `None`, the first update must contain a full tree.

### Live regions and announcements in AccessKit
- Schema: `Node::live` (Off, Polite, Assertive), `live_atomic`, `busy`. There is no separate "announce this string" API in the schema (not found in the docs or changelog read; the changelog lists only "Basic live regions" in 0.5.0, 2022-09-23).
- Windows: the adapter raises `UIA_LiveRegionChangedEventId` when a live node with a name is added or its live setting or name changes. The adapter source contains no `UiaRaiseNotificationEvent` use and ends with "TODO: handle other events (#20)" (adapters/windows/src/adapter.rs).
- macOS: live updates are posted as `NSAccessibilityAnnouncementRequestedNotification` with the label as the announcement; Assertive maps to `NSAccessibilityPriorityHigh`, everything else to `NSAccessibilityPriorityMedium` (adapters/macos/src/event.rs). Open issue #852 (2026-11-05, no maintainer reply) reports VoiceOver dropping medium-priority announcements that arrive while it is speaking, reproduced with a native NSButton, so it appears to be VoiceOver behaviour; Orca on Linux spoke the same toast; Windows and iOS untested. Chromium uses the same priority mapping (issue text, unverified against Chromium source).
- Linux: the adapter source files read (`adapter.rs`, `atspi/mod.rs`) show no live-region or announcement handling; whether `accesskit_unix` emits announcement or live-region events elsewhere (for example in the `interfaces` modules) was not established. Downstream reports in other projects say Linux does not announce on updates and a new node is created per announcement (zmail PR #230, unverified against real screen readers).
- Android: live region support added in `accesskit_android` 0.9.0.
- Downstream reports say Windows and Linux announce by node name, so a live node needs a label (GPUI issue #3659, secondary and unverified).

### Not covered by AccessKit
- AccessKit exposes text structure and selection, but IME and text input handling are separate platform concerns (not part of AccessKit; see TASK-99.3).
- Rich text and hypertext are unsupported (README).

## 3. Alternatives

### 3a. Implement each platform API directly
Per platform, the API in section 1 plus a Rust or native binding:
- Windows: UIA provider interfaces (`IRawElementProviderSimple`, Fragment, FragmentRoot) and patterns, handled in `WM_GETOBJECT` (Microsoft Learn). Announcements via `UiaRaiseNotificationEvent` are available directly, which AccessKit does not currently use.
- macOS: `NSAccessibilityElement` or protocol conformance on the view (Apple page text unavailable).
- Linux: export AT-SPI objects over D-Bus with an AT-SPI implementation (the `atspi` and `zbus` crates are what AccessKit uses; at-spi2-core defines the interfaces).
- Android: `AccessibilityNodeProvider` or `ExploreByTouchHelper`, in Java or Kotlin, reached through JNI if the engine is not JVM.
This is the same work AccessKit does; the difference is who owns four adapters, each with different threading and activation rules.

### 3b. Toolkit-owned stacks (not reusable as a library)
- Flutter: builds its own semantics tree from widgets and bridges it per platform. First-party docs list screen readers per platform (TalkBack, VoiceOver, Narrator/NVDA, Orca) but the page read does not describe the UIA, NSAccessibility, AT-SPI mapping (those details are unverified). `SemanticsService.sendAnnouncement` documents that assertiveness is only supported on web and that Android deprecated announcement events as "disruptive" (TalkBack clears its speech queue); it recommends `Semantics` to trigger announcements implicitly (https://api.flutter.dev/flutter/semantics/SemanticsService/sendAnnouncement.html).
- Qt: `QAccessibleInterface` subclasses, `QAccessible::updateAccessibility()` after changes, `QAccessibleAnnouncementEvent` to request an announcement; "Qt does use platform-specific APIs" (https://doc.qt.io/qt-6/accessible-qwidget.html). The pages read do not list backends per platform (unverified).
- Chromium: AccessKit's schema is "based largely on Chromium's accessibility abstraction" (ARCHITECTURE.md); Chromium's own code is not packaged as a standalone library (not investigated further).

### 3c. Android specifics worth separating
- `announceForAccessibility` deprecation could not be confirmed from the Android page read (truncated); Flutter's docs report Android's deprecation. The View reference does confirm live regions (`accessibilityLiveRegion` none, polite, assertive) and pane titles as the declarative alternatives.

## 4. Mapping Gable's `LiveAnnouncer` and `FocusManager`

Current contracts (packages/core/src/platform.ts on main):
- `LiveAnnouncer.announce(message, politeness?: "polite" | "assertive")` and `clear()`. The doc says announcing the same text twice in a row is heard twice, and empty messages are ignored. The DOM implementation keeps hidden status and alert regions in the overlay root or `document.body`.
- `FocusManager.focus(target: FocusTarget): boolean`, where `FocusTarget` is a CSS selector or a list of selectors tried in order; the DOM implementation makes non-focusable targets `tabindex="-1"`.

Facts about how these relate to the platform APIs (not a recommendation):

| Gable concept | Native-side counterparts | Gaps or differences |
|---|---|---|
| `announce(msg, polite)` | AccessKit: a node with `live = Polite` whose label changes (Windows live-region event, macOS announcement at medium priority, Android live region); UIA direct: `UiaRaiseNotificationEvent`; Qt: `QAccessibleAnnouncementEvent`; Flutter: `sendAnnouncement` | AccessKit has no string-announcement call; a live node must hold the text and have its label change. "Same text twice is heard twice" would need a changed label or a fresh node (zmail PR #230 reports creating a new node per announcement, unverified). On macOS polite is medium priority and can be dropped by VoiceOver (AccessKit #852). Linux emission is unconfirmed in the sources read. |
| `announce(msg, assertive)` | Live = Assertive; macOS high priority; Android assertive live region | Per-platform assertiveness semantics were not compared against real screen readers here. |
| `clear()` | Empty the live node's label | No platform counterpart read in the sources. |
| `focus(target)` | AccessKit: set `TreeUpdate.focus` to a node id (keyboard focus within the window) and optionally respond to `Action::Focus`; macOS `NSAccessibilityFocusedUIElementChangedNotification` is raised by the adapter; Android has two focus types (`FOCUS_INPUT` and `FOCUS_ACCESSIBILITY`) in `findFocus` | Selector targets have no native meaning; a node-id or role-based target is a different contract. AccessKit's `focus` is "the node that holds keyboard focus while the host window is focused", so screen reader cursor movement is separate (action `Focus` or `SetSequentialFocusNavigationStartingPoint`). The ios adapter fixed "focus moves when VoiceOver moves to an element" in 0.2.2, indicating the two kinds of focus must be kept apart. |
| Gable focus trap, roving tabindex, `useLayer` (docs/ui-primitives.md) | Keyboard focus and tree structure are the framework's job when own-drawn; modal hiding of outside content maps to `hidden` or a subtree choice in the node tree | The DOM version uses `aria-hidden` (`@zag-js/aria-hidden`); a native equivalent would be marking background nodes hidden in updates (property exists: `is_hidden`). |

Roles and names: Gable's DOM output relies on ARIA attributes (Zag machines emit them). AccessKit `Role` names follow ARIA and Chromium, so the roles Zag-style primitives need (dialog, alert, status, tab, menu, list, text input are all present in the 182 roles) exist as enum variants; the mapping layer from attributes to `Role`/`Node` properties was not examined here.

## 5. Comparison summary

| Concern | AccessKit | Direct per-platform | Toolkit stacks (Flutter, Qt) |
|---|---|---|---|
| Windows, macOS, Linux, Android coverage | All four released, plus iOS; Android needs glue Java class (or own glue); Android winit support limited to GameActivity | Same four APIs, implemented by the project | Each covers its own platforms; not separable as a library |
| Maturity | Pre-1.0, active, several breaking releases; used by Bevy, egui, Freya, Slint, Xilem | Platform APIs stable; implementation effort is the project's | Mature, but tied to their own engines |
| Languages | Rust native; C and Python bindings | Platform-native language per OS | C++ (Qt), Dart/C++ engine (Flutter) |
| Live regions | Schema supports; Windows via live-region events only (no UIA Notification), macOS announcement notification, Android since 0.9.0, Linux unconfirmed | Full access to each platform's announcement API | `sendAnnouncement`, `QAccessibleAnnouncementEvent` |
| Text and rich text | Text selection and per-character geometry; rich text unsupported | Whatever the project implements | Supported by the toolkit |
| Threading | Differs per adapter (main-thread on macOS; background-thread handlers on Linux) | Per platform | Hidden by toolkit |
| macOS verifiability without a Mac | Adapter is one crate; verification needs a Mac or CI runner | Same | Same |

## 6. Open items not resolved from primary sources
- Whether `accesskit_unix` emits announcements or live-region events (the `interfaces` and `bus` modules were not read).
- Whether Windows live-region events alone are spoken by NVDA, JAWS and Narrator without a name-changing node (only downstream reports found).
- The Apple documentation text for `NSAccessibilityElement` and `announcementRequested`, and the Android `announceForAccessibility` deprecation note (pages returned no text or were truncated).
- The Qt per-platform backend list and the Flutter UIA, AT-SPI mapping (pages read did not include them).
- Real screen reader behaviour: none was tested; every behaviour claim above is from documentation, source or issue reports.
