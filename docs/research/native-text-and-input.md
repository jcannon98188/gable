# Text shaping, layout, rendering and input across the four platforms

Research for TASK-99.3 (parent: TASK-99 Gable Native design map). Facts and comparison only; no decision.
Question: what does an own-drawn renderer need for production text on Windows, macOS, Linux and Android (shaping, line breaking, font fallback, rich text, editing, IME, clipboard), and which components are reusable versus per-platform?
Research date: 2026-11-07. Sources are cited inline; "Gap" marks things not verified from a primary source.

## 1. What an own-drawn renderer must supply

Layers, bottom to top (the layering follows DirectWrite's own factoring, [DirectWrite intro](https://learn.microsoft.com/en-us/windows/win32/directwrite/introducing-directwrite): font system, script processor/shaper, layout, glyph rendering):

1. Font discovery, matching and fallback.
2. Itemization (script, language, bidi runs) and shaping.
3. Segmentation: grapheme, word, line-break opportunities.
4. Layout: wrapping, alignment, rich-text spans, hit-testing, selection geometry, caret.
5. Glyph rasterization / atlas (or outlines to the GPU).
6. Editing model: selection, composition (preedit) region, undo.
7. Platform input bridges: IME, clipboard.

## 2. Shaping, segmentation, layout: cross-platform components

### HarfBuzz / HarfRust
- HarfBuzz is "a text shaping library" that maps Unicode input to positioned glyphs, with integrations for FreeType, CoreText, DirectWrite and others ([harfbuzz.github.io](https://harfbuzz.github.io/)). The fetched page did not state its non-goals (line breaking, bidi, fallback). Gap: confirm on the "What HarfBuzz doesn't do" section.
- HarfRust is the Rust port, currently matching HarfBuzz v15.0.0; forked from RustyBuzz; uses `read-fonts` (Fontations) for parsing; no `unsafe` apart from `bytemuck`; within about 25% of HarfBuzz speed on common fonts; no integration with FreeType/CoreText/DirectWrite/ICU, no Graphite; font size is not a shaping input (units-per-em) ([harfrust README](https://github.com/harfbuzz/harfrust)).
- rustybuzz README: "not developed further, unmaintained, and archived"; points to HarfRust ([rustybuzz README](https://github.com/harfbuzz/rustybuzz)).

### cosmic-text (pop-os)
- Shaping via HarfRust; custom safe-Rust layout with bidi; custom font fallback chosen by locale, per line and per character; rendering via swash; font loading via fontdb ([README](https://github.com/pop-os/cosmic-text)).
- Roadmap: text editing and selection done; copy/paste not done; wrapping with indentation, no-wrap and ellipsize unchecked; the README says it is not yet "ready"; IME is not mentioned.
- "Linux, macOS, and Windows are supported with the full feature set"; "Other platforms may need to implement font fallback capabilities" (Android is not covered by its own fallback).

### Parley (Linebender) + Fontique
- Parley "provides an API for implementing rich text layout" (glyph positions, line breaking, bidi) with "utilities for text selection and editing". Dependencies: Fontique (enumeration and fallback), HarfRust (shaping), Skrifa (font reading), ICU4X (bidi and segmentation) ([parley README](https://github.com/linebender/parley)).
- Fontique system backends, per `fontique/src/backend/mod.rs`: DirectWrite (Windows), Core Text (Apple vendor), Fontconfig (Linux/FreeBSD), Android (`target_os = "android"`); a dummy backend otherwise ([source](https://github.com/linebender/parley/blob/main/fontique/src/backend/mod.rs)). Fontconfig can be dlopen'd; without it "font fallback to system fonts will not work" ([fontique README](https://github.com/linebender/parley/blob/main/fontique/README.md)).
- `PlainEditor` exposes IME state: `is_composing`, `raw_compose` (preedit range), `raw_text` vs `text` (with/without preedit), `ime_cursor_area`, selection and cursor geometry ([docs.rs](https://docs.rs/parley/latest/parley/editing/struct.PlainEditor.html)). The fetched page did not list cursor-movement or undo methods. Gap: verify in source.
- Maturity statement: none found in the README (it only gives an MSRV of 1.88).

### ICU4X segmenter and unicode-bidi
- Segments by lines, graphemes, words, sentences; line breaking follows UAX #14 (Unicode 15.1.0, 17.0.0+ via constructors), with CSS `line-break`/`word-break` tailoring; grapheme/word/sentence follow UAX #29 ([README](https://github.com/unicode-org/icu4x/tree/main/components/segmenter)). The README text fetched does not describe dictionary/LSTM segmentation for Thai, Khmer, CJK. Gap.
- `unicode-bidi` 0.3.18: safe Rust UAX #9, `BidiInfo`, `no_std`+alloc option ([docs.rs](https://docs.rs/unicode-bidi/latest/unicode_bidi/)).

### Skia (SkParagraph, SkShaper)
- `Paragraph` API: `layout(width)`, `paint`, `getRectsForRange`, `getGlyphPositionAtCoordinate`, `getWordBoundary`, line metrics, glyph cluster queries, placeholders, `unresolvedCodepoints`, font queries ([Paragraph.h](https://github.com/google/skia/blob/main/modules/skparagraph/include/Paragraph.h)).
- `SkShaper` takes font, bidi, script and language run iterators; factories exist for HarfBuzz and CoreText backends; fallback via an `SkFontMgr` run iterator ([SkShaper.h](https://github.com/google/skia/blob/main/modules/skshaper/include/SkShaper.h)).
- Using Skia text implies Skia as the graphics layer (relevant to TASK-99.1); not evaluated here.

### Platform text engines (non-portable but available)
- DirectWrite (Windows): layered API (text layout, script processor, glyph rendering, font system); supports bidi, line breaking, shaping, font enumeration, fallback and caching; independent of the rendering system ([intro](https://learn.microsoft.com/en-us/windows/win32/directwrite/introducing-directwrite)). `IDWriteFontFallback::MapCharacters` picks a font for the beginning range of text; system fallback comes from `IDWriteFactory2::GetSystemFontFallback`, Windows 8.1+ ([doc](https://learn.microsoft.com/en-us/windows/win32/api/dwrite_2/nn-dwrite_2-idwritefontfallback)).
- Core Text (macOS): framesetter / typesetter / frame / line / run hierarchy; attributed strings; "font cascading" via cascade lists (system default depends on user language and current font; `CTFontCreateForString` picks a font that can encode a string). Core Text is "designed for development of higher-level text-handling frameworks" ([Core Text Programming Guide, archive](https://developer.apple.com/library/archive/documentation/StringsTextFonts/Conceptual/CoreText_Programming/Overview/Overview.html)). Callable from multiple threads if shared inputs are not mutated.
- Android NDK: no text layout or shaping API found. The NDK `Font` group (API 29+) only enumerates system fonts and matches a font for a UTF-16 run: `ASystemFontIterator`, `AFontMatcher_match(familyName, text, ...)` returns a font and run length, with locale and variant settings; `AFont_getFontFilePath` gives a path to a .ttf/.otf/.ttc/.otc ([NDK Font reference](https://developer.android.com/ndk/reference/group/font)). Gap: pre-API-29 behaviour, and whether any other native text-layout API exists.
- Linux: Fontconfig for enumeration and fallback (via Fontique, above); no system shaper found. Gap: no primary-source page fetched for Pango or fontconfig specifics.

## 3. Comparison table (reusable vs per platform)

| Concern | Cross-platform component(s) | Per-platform piece |
|---|---|---|
| Shaping | HarfRust (Rust), HarfBuzz (C++) | none required; CoreText/DirectWrite shapers optional |
| Bidi / segmentation | ICU4X, unicode-bidi | none |
| Layout, wrapping, selection geometry | Parley, cosmic-text, SkParagraph | none (see maturity notes) |
| Font enumeration | Fontique (DirectWrite, CoreText, fontconfig, Android backends); fontdb (cosmic-text) | cosmic-text has no Android fallback |
| Font fallback | Fontique, cosmic-text (custom), SkFontMgr | OS fallback: DirectWrite, Core Text cascade, fontconfig, NDK `AFontMatcher` (API 29+) |
| Rasterization | swash, Skrifa, Skia | none required |
| Editing model | Parley `PlainEditor`, cosmic-text editor (no copy/paste) | none |
| IME | winit `Ime` events (section 4) | TSF/IMM32, NSTextInputClient, text-input-v3 / X11, InputConnection |
| Clipboard | arboard (desktop only) | Android clipboard via Java; see section 5 |

## 4. IME and composition

Common model across platforms: the IME owns a preedit (composing / marked) string plus a candidate window; the app must expose the caret rectangle and often surrounding text, then apply commits and deletions.

- Windows: Text Services Framework is a COM system service for "advanced text input"; apps can enable TSF to receive text services ([TSF overview](https://learn.microsoft.com/en-us/windows/win32/tsf/text-services-framework)). Gap: `ITextStoreACP` details and IMM32 fallback not fetched.
- macOS: `NSTextInputClient` required methods (from Apple's documentation JSON): `attributedString`, `attributedSubstring(forProposedRange:actualRange:)`, `characterIndex(for:)`, `doCommand(by:)`, `firstRect(forCharacterRange:actualRange:)`, `hasMarkedText`, `insertText(_:replacementRange:)`, `markedRange`, `selectedRange`, `setMarkedText(_:selectedRange:replacementRange:)`, `unmarkText`, `validAttributesForMarkedText`. Optional: `baselineDeltaForCharacter`, `drawsVerticallyForCharacter`, `fractionOfDistanceThroughGlyph`, adaptive image glyph support ([NSTextInputClient](https://developer.apple.com/documentation/appkit/nstextinputclient)). A custom-drawn view must implement this protocol itself. Gap: range units (believed UTF-16 `NSRange`) not verified from the page.
- Wayland: `zwp_text_input_v3` events `preedit_string`, `commit_string`, `delete_surrounding_text`, applied on `done` (serial-checked); requests `set_surrounding_text` (UTF-8, max 4000 bytes), `set_cursor_rectangle`, `set_content_type`; offsets are bytes ([protocol](https://wayland.app/protocols/text-input-unstable-v3)). Gap: X11 (XIM/IBus/Fcitx) not fetched.
- Android: `InputConnection` is how the IME reads text around the cursor and commits text; key methods `commitText`, `setComposingText`, `finishComposingText`, `getTextBeforeCursor`, `deleteSurroundingText` (lengths in Java chars); the editor returns it from `View#onCreateInputConnection(EditorInfo)` ([doc](https://developer.android.com/reference/android/view/inputmethod/InputConnection)).
  - Native route: `NativeActivity` has no input-method framework (basic ASCII via key events only); `GameActivity` provides IME through `GameTextInput` with span updates ([android-activity README](https://github.com/rust-mobile/android-activity)).
  - `GameTextInput` is "not meant for fully-fledged text editor apps" but offers selection and composing-region support plus spell-check, completions and multi-key characters; it accumulates text in an internal buffer and notifies the app; it ships Java classes that must be packaged ([AGDK guide](https://developer.android.com/games/agdk/add-support-for-text-input)).
- winit abstraction: `Ime::{Enabled, Preedit(String, Option<(usize,usize)>), Commit(String), Disabled}` with byte-wise cursor; `Window::set_ime_cursor_area` places candidate boxes; a synthetic empty Preedit precedes Commit; the page marks its example sequences "not tested" ([winit 0.30.13 docs](https://docs.rs/winit/latest/winit/event/enum.Ime.html)). No `DeleteSurrounding` variant was on that page. Gap: newer versions, and per-platform completeness (including Android).
- Index units differ: Wayland and winit use UTF-8 bytes; Android uses UTF-16 chars.

## 5. Clipboard

- Windows: Win32 clipboard with registered formats, delayed rendering (`WM_RENDERFORMAT`, `WM_RENDERALLFORMATS`), change notification (`WM_CLIPBOARDUPDATE`, `AddClipboardFormatListener`), sequence number; Microsoft notes it should not carry sensitive data ([Clipboard](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard)).
- macOS: `NSPasteboard`. The Apple page did not render in the fetch tool, so nothing is verified from the primary source. Gap.
- Wayland: `wl_data_device.set_selection(source, serial)` with MIME-type offers; the source writes data to a file descriptor on request; sources cannot be reused; the replaced source receives `cancelled` ([wayland protocol](https://wayland.app/protocols/wayland)). The source app must stay alive to serve data. The focus requirement was not confirmed from the page.
- Android: `ClipboardManager` gets/sets a `ClipData` primary clip; `getPrimaryClip` returns null if the app "is not the default IME or does not have input focus" ([doc](https://developer.android.com/reference/android/content/ClipboardManager)).
- arboard (1Password, volunteer-maintained): Linux/macOS/Windows text and image; Linux default is X11 (including XWayland); native Wayland needs the non-default `wayland-data-control` feature and compositor support; on Linux data can vanish if the `Clipboard` is dropped or the process exits ([README](https://github.com/1Password/arboard)). No Android support stated.
- Rich-text (HTML) clipboard: Windows has an HTML Clipboard Format topic; no cross-platform crate fetched documents HTML support. Gap.

## 6. Rich text and editing

- Layout-side rich text: Parley ("rich text layout"), SkParagraph (placeholders, per-range paint), DirectWrite `IDWriteTextLayout` (range formatting), Core Text (attributed strings). Parley's span/style API was not fetched. Gap.
- Editing-side: Parley `PlainEditor` (plain text, IME-preedit aware); cosmic-text editing and selection (no copy/paste). Neither source claims a formatted rich-text editor. No portable editing model with undo was verified.

## 7. macOS and Android specifics gathered

- macOS: Fontique has a Core Text backend; Core Text cascade lists depend on user language and current font; IME requires an `NSTextInputClient` implementation on the app's own view. Retina scaling, Metal text rasterization and the pasteboard were not covered by verified sources. Gap.
- Android: usable IME through `android-activity` needs GameActivity (Java/Kotlin shipped in the app); NativeActivity lacks IME; system font matching via NDK needs API 29.

## 8. Open gaps

- HarfBuzz non-goals; ICU4X dictionary/LSTM segmentation; Pango.
- Fontique's Android fallback behaviour; pre-API-29 Android fonts.
- Windows TSF text-store contract and IMM32 coexistence; X11 IME.
- NSPasteboard primary-source text; macOS Retina/Metal text.
- Parley/cosmic-text production maturity; winit IME per-platform completeness; Parley editor undo and rich-text styling API.
- Flutter's and Compose's text/IME bridging (the Flutter pages fetched were 404 or did not name the layout library).
