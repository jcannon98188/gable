# Media playback on the four platforms (Gable Native)

Research for TASK-99.15, parent TASK-99 (Gable Native design map). Dated 2026-11-07.
Facts and comparison only. No decision is made here; TASK-99.17 consumes this.

Question: Gable Native v1 includes `video`, `audio`, `track` and `source` elements. What can play media on Windows, macOS, Linux and Android from a Rust host, and how does each produce frames for a Skia-drawn surface?

## How to read this

Each claim carries a source link. Claims tagged **[unverified]** come from general knowledge, not from a page fetched during this research, and need checking before anyone relies on them. The list of unverified items is in the last section. Where a fetched page did not answer the question, that is stated rather than filled in.

Source quality notes:

- Microsoft Learn, Android developer docs, WHATWG, W3C, GStreamer docs and crates.io metadata were fetched and read.
- Apple's documentation site is client-rendered; the page HTML was empty. Apple facts below come from Apple's own documentation JSON (`developer.apple.com/tutorials/data/documentation/...`), which returned the symbol list and one-line abstracts but not the long-form discussion. Anything beyond those abstracts is tagged **[unverified]**.
- No instructions were found inside any fetched web content during this research.

---

## 1. Summary table

| | Windows | macOS | Linux | Android |
|---|---|---|---|---|
| Platform player | Media Foundation (Media Engine, Source Reader) | AVFoundation (`AVPlayer`) | None in the OS. GStreamer is the de-facto framework but is a third-party install | Media3 ExoPlayer (Java/Kotlin, via JNI); NDK has only low-level `AMediaCodec`/`AMediaExtractor` |
| Frame access for custom rendering | `IMFMediaEngine::TransferVideoFrame` to a DXGI surface or WIC bitmap; Source Reader | `AVPlayerItemVideoOutput` yields `CVPixelBuffer` | GStreamer `appsink` samples | `Surface`/`SurfaceTexture`/`ImageReader`, `AHardwareBuffer` |
| HTMLMediaElement-shaped API | Closest: Media Engine mirrors HTML5 media element, events below 1000 are the HTML5 events | KVO on `rate`/`timeControlStatus`/item `status`, periodic time observer | `GstPlay` messages (mapping is manual) | `Player.Listener` callbacks (mapping is manual) |
| HLS | Not confirmed in fetched sources **[unverified]** | Yes (`AVPlayer` plays HLS) | `hlsdemux2` | Yes (ExoPlayer; platform MediaPlayer only MPEG-TS HLS) |
| DASH | Not confirmed **[unverified]** | No native DASH **[unverified]** | `dashdemux2` | Yes (ExoPlayer) |
| WebVTT | Not confirmed **[unverified]** | HLS WebVTT as legible tracks, app can render via `AVPlayerItemLegibleOutput` | Via GStreamer subtitle plumbing, not verified | Yes, ExoPlayer standalone and in HLS/DASH |
| Software fallback license | Closed OS component | Closed OS component | LGPL (GStreamer core) | Apache-2.0 (Media3) |

---

## 2. Platform decoders

### 2.1 Windows: Media Foundation

**Containers and codecs shipped.** Microsoft's "Supported Media Formats in Media Foundation" page lists: 3GP, ASF, ADTS, AVI, MP3, MPEG-4 (`.m4a .m4v .mov .mp4`), SAMI, WAVE as containers. Video decoders: H.264, H.263 (Windows 8+), MJPEG, MPEG-4 Part 2, MPEG-4 v1/v2/v3, WMV, DV. Audio decoders: AAC, MP3, WMA, ADPCM, GSM 6.10, mu-law. The page lists no WebM, Matroska, MPEG-TS, HEVC, VP9 or AV1 entry. [Supported media formats](https://learn.microsoft.com/en-us/windows/win32/medfound/supported-media-formats-in-media-foundation)

Third parties can add formats "by writing custom plug-ins" (same page). Whether HEVC/VP9/AV1 arrive as separately distributed Windows extensions is **[unverified]**: the page I tried for it returned 404.

**Media Engine.** `IMFMediaEngine` (Windows 8+) "enables an application to play audio or video files". Its methods mirror the HTML media element: `SetSource`, `SetSourceElements` (a list of sources, like `<source>`), `Load`, `CanPlayType`, `Play`, `Pause`, `SetCurrentTime`, `GetDuration`, `GetBuffered`, `GetSeekable`, `GetPlayed`, `GetNetworkState`, `GetReadyState`, `SetPreload`, `SetAutoPlay`, `SetLoop`, `SetMuted`, `SetVolume`, `SetPlaybackRate`, `SetDefaultPlaybackRate`, `IsSeeking`, `IsEnded`, `IsPaused`, `GetError`. [IMFMediaEngine](https://learn.microsoft.com/en-us/windows/win32/api/mfmediaengine/nn-mfmediaengine-imfmediaengine)

Events: `MF_MEDIA_ENGINE_EVENT` includes `LOADSTART, PROGRESS, SUSPEND, ABORT, ERROR, EMPTIED, STALLED, PLAY, PAUSE, LOADEDMETADATA, LOADEDDATA, WAITING, PLAYING, CANPLAY, CANPLAYTHROUGH, SEEKING, SEEKED, TIMEUPDATE, ENDED, RATECHANGE, DURATIONCHANGE, VOLUMECHANGE`. Microsoft states: "Values below 1000 correspond to events defined in HTML 5 for media elements." Extras above 1000 include `FORMATCHANGE`, `BUFFERINGSTARTED/ENDED`, `FIRSTFRAMEREADY`, `TRACKSCHANGE`, `RESOURCELOST`, `AUDIOENDPOINTCHANGE`. [MF_MEDIA_ENGINE_EVENT](https://learn.microsoft.com/en-us/windows/win32/api/mfmediaengine/ne-mfmediaengine-mf_media_engine_event)

**Frames into a texture.** `IMFMediaEngine::TransferVideoFrame` "copies the current video frame to a DXGI surface or WIC bitmap", and `OnVideoStreamTick` reports whether a new frame is ready (IMFMediaEngine page above). So frame-server style output exists, as a copy into a D3D11 texture the host owns. The dedicated "frame server mode" pages I tried (two URLs) returned 404, so details of device-manager setup (`MF_MEDIA_ENGINE_DXGI_MANAGER`) are **[unverified]**.

**Audio.** Media Engine renders audio itself; it exposes `SetVolume`, `SetMuted`, balance, and fires `AUDIOENDPOINTCHANGE`. A/V sync is internal to the engine (event list above).

**Streaming, captions, DRM.** HLS/DASH, WebVTT and PlayReady support in Media Engine are **[unverified]**. The `MF_MEDIA_ENGINE_EVENT_OPMINFO` entry shows Output Protection Manager integration exists (event list above).

**Redistribution.** Media Foundation is part of Windows; no binaries to ship.

### 2.2 macOS: AVFoundation

Verification note: the author cannot test on a Mac. See section 9 for what CI can and cannot check.

**What the docs list.** From Apple's documentation JSON:

- `AVPlayer`: "an object that provides the interface to control the player's transport behavior"; it plays "local and remote file-based media, such as QuickTime movies and MP3 audio files, as well as audiovisual media served using HTTP Live Streaming". Members include `rate`, `timeControlStatus` ("playing, paused indefinitely, or waiting for network conditions to improve"), `automaticallyWaitsToMinimizeStalling`, `seek(to:toleranceBefore:toleranceAfter:completionHandler:)`, `currentTime()`, `isMuted`, `volume`, `preroll(atRate:completionHandler:)`, `setRate(_:time:atHostTime:)` ("synchronizes the playback rate and time of the current item with an external source"), `rateDidChangeNotification`. [AVPlayer](https://developer.apple.com/documentation/avfoundation/avplayer) ([JSON](https://developer.apple.com/tutorials/data/documentation/avfoundation/avplayer.json))
- `AVPlayerItemVideoOutput`: "an object that outputs video frames from a player item". `copyPixelBuffer(forItemTime:itemTimeForDisplay:)` "retrieves an image that is appropriate for display at the specified item time, and marks the image as acquired"; `hasNewPixelBuffer(forItemTime:)`; `init(pixelBufferAttributes:)`; `requestNotificationOfMediaDataChange(withAdvanceInterval:)`. [AVPlayerItemVideoOutput](https://developer.apple.com/documentation/avfoundation/avplayeritemvideooutput)
- `AVPlayerItemLegibleOutput`: "vends attributed strings for media with a legible characteristic". [AVPlayerItemLegibleOutput](https://developer.apple.com/documentation/avfoundation/avplayeritemlegibleoutput)

**Not verified from Apple primary text** (the pages returned only titles): that pixel buffers can be IOSurface/Metal-compatible via `kCVPixelBufferMetalCompatibilityKey` and `kCVPixelBufferIOSurfacePropertiesKey`, that `CVMetalTextureCache` wraps them as `MTLTexture`, that `CADisplayLink`/`CVDisplayLink` is the usual pull cadence, WebVTT-in-HLS behaviour, codec/container coverage (H.264, HEVC, AAC, ALAC, MP4/MOV, HLS), and whether sidecar `.vtt` files load. All **[unverified]**.

**Rust access.** `objc2-av-foundation` 0.3.2 (Zlib OR Apache-2.0 OR MIT), part of `objc2` by madsmtm; objc2 0.6.5, last updated 2026-10-05. [crates.io API: objc2-av-foundation](https://crates.io/api/v1/crates/objc2-av-foundation), [objc2](https://crates.io/api/v1/crates/objc2)

### 2.3 Linux: GStreamer or alternatives

There is no OS-level player on Linux; options are GStreamer, FFmpeg, libmpv or libVLC.

**GStreamer facts.**

- Licence: "GStreamer is released under the LGPL"; "We require that all code going into our core packages is LGPL." Core/base/good "can't include plugins with known patent issues"; the `ugly` module holds "plugins with known patent issues"; official modules do not accept GPL code, though some accept LGPL plugins linking to external GPL libraries. [GStreamer licensing FAQ](https://gstreamer.freedesktop.org/documentation/frequently-asked-questions/licensing.html)
- Adaptive streaming: `hlsdemux2` (HLS), `dashdemux2` (DASH), `mssdemux2` (Smooth Streaming); "they download their own fragments" and need a streams-aware container such as `urisourcebin`, `decodebin3` or `playbin3`. [adaptivedemux2](https://gstreamer.freedesktop.org/documentation/adaptivedemux2/index.html)
- `appsink`: `pull-sample` blocks until a sample or EOS and only returns samples while PLAYING; `new-sample` signal fires only when `emit-signals` is TRUE (not default); `caps` property restricts accepted caps; `max-buffers`/`max-bytes`/`max-time`/`leaky-type` bound queue memory. [appsink](https://gstreamer.freedesktop.org/documentation/app/appsink.html)
- Zero-copy: GStreamer memory is wrapped in `GstMemory` with allocators per type; on Linux, buffers are exchanged with DMAbuf; zero-copy works only when producer matches consumer layout (stride/alignment), otherwise the consumer copies. [Allocation](https://gstreamer.freedesktop.org/documentation/plugin-development/advanced/allocation.html). The page does not mention `GstGLMemory`; the `gstreamer-gl` crate exists (below).
- Platforms and packaging (stable 1.28.8): Windows `.exe` installers for MSVC (x86_64, x86, arm64) and MinGW; macOS `.pkg` framework (oldest supported 10.13); Android universal `.tar.xz` (armv7, arm64, x86, x86_64); iOS/tvOS xcframework tarball. Linux: use the distro package manager. [Download](https://gstreamer.freedesktop.org/download/)
- Windows redistribution: runtime files you "probably want to distribute", plus Merge Modules; the app must make GStreamer find its libraries and plugins (`PATH` or run from install dir). [On Windows](https://gstreamer.freedesktop.org/documentation/installing/on-windows.html)
- `GstPlay` high-level API page returned 404; its message surface is **[unverified]**.

**Other Linux options (not fetched, **[unverified]** as to specifics):** direct FFmpeg with VA-API, `libmpv` (Rust crate `libmpv2` LGPL-2.1, see section 10), libVLC.

### 2.4 Android: MediaCodec and ExoPlayer/Media3

**Platform codecs.** From the Android supported-formats page: AAC (LC, HE-AAC v1/v2, xHE-AAC on Android 9+), AMR, FLAC, MP3, Opus (decode Android 5.0+), PCM, Vorbis; video H.263, H.264 (BP/MP), H.265/HEVC (decode Android 5.0+, "Main Profile Level 3 for mobile devices and Main Profile Level 4.1 for Android TV"), MPEG-4 SP, VP8, VP9 (4.4+), AV1 (decode Android 10+; encoder and decoder mandatory from Android 14), APV (Android 16+). The page also says "a particular mobile device might support additional formats", and that using `MediaCodec` directly gives access to "any of the available media formats regardless of the supported file types". Network protocols for the platform stack: RTSP, HTTP/HTTPS progressive, and HLS "MPEG-2 TS media files only". [Supported media formats](https://developer.android.com/media/platform/supported-formats)

**ExoPlayer (Media3).** Apache-2.0 repository, `media3-exoplayer`, `media3-exoplayer-dash`, `media3-ui`, others. [androidx/media](https://github.com/androidx/media)

- DASH: FMP4, WebM, Matroska (demuxed streams only); MPEG-TS no. HLS: MPEG-TS, FMP4/CMAF, ADTS, MP3; AES-128 yes, sample AES-128 no. SmoothStreaming: FMP4. Live and low-latency (Apple LL-HLS yes, community LL-HLS no). Progressive containers: MP4, M4A, FMP4, WebM, Matroska, MP3, Ogg, WAV, MPEG-TS, MPEG-PS, FLV (not seekable), ADTS, FLAC, AMR. [Supported formats](https://developer.android.com/media/media3/exoplayer/supported-formats)
- Captions: WebVTT supported standalone, embedded in FMP4 for DASH, and in HLS; TTML, SubRip, SSA/ASS also supported; CEA-608/708 in HLS and DASH. (same page)
- DRM: Widevine ("cenc" API 19+, "cbcs" API 25+), ClearKey (API 21+), PlayReady SL2000 on Android TV only (same page).
- Sample formats come from platform decoders; software-decoder extensions exist for AV1, VP9, FLAC, Opus, FFmpeg, MIDI, IAMF, MPEG-H and "must be manually built" (same page). The FFmpeg extension lists audio decoders only (Vorbis, Opus, FLAC, ALAC, PCM, MP1-3, AMR, AAC, AC-3, E-AC-3, DTS, TrueHD).
- Architecture: injected `MediaSource`, `Renderer`, `TrackSelector`, `LoadControl`; custom `Renderer`, `Extractor`, `MediaSource`, `DataSource` can be provided. [Customization](https://developer.android.com/media/media3/exoplayer/customization)
- Tracks: `Player.Listener.onTracksChanged`, `getCurrentTracks()`, `TrackSelectionParameters`, per-type disable. [Track selection](https://developer.android.com/media/media3/exoplayer/track-selection)
- Asynchronous `MediaCodec` queueing is on by default from Android 12 (customization page).
- Size (artifact files, from `dl.google.com/android/maven2`, version 1.11.1, measured via HTTP `Content-Length`): `media3-exoplayer` 1,703,377 B; `-hls` 263,835; `-dash` 149,760; `media3-common` 644,502; `-extractor` 823,954; `-datasource` 168,578; `-container` 67,351; `-decoder` 19,422; `-database` 7,197 (AAR compressed, pre-R8; about 3.8 MB in total). Maven metadata lists 1.11.1 as latest stable, 1.12.0-alpha02 as latest.

**NDK-level options.** The NDK media reference lists `AMediaCodec`, `AMediaExtractor`, `AImageReader`, `AMediaDrm`, `AMediaCrypto`, `AMediaFormat`, `AMediaMuxer`, `AMediaDataSource`. [NDK media](https://developer.android.com/ndk/reference/group/media). The page text read was truncated; API levels, and the statement that the NDK offers no high-level player (audio output, sync, buffering and seeking are the caller's job), are from general knowledge **[unverified]**.

**Zero-copy path.** `AHardwareBuffer` objects are "chunks of memory that can be accessed by various hardware components"; operations are zero-copy; they "can be bound to EGL/OpenGL and Vulkan primitives" (EGL via `eglGetNativeClientBufferANDROID` + `eglCreateImageKHR`; Vulkan via `VK_ANDROID_external_memory_android_hardware_buffer`). Formats include `Y8Cb8Cr8_420` and `YCbCr_P010`, "can be accessed in OpenGL shaders through an external sampler". Usage flag `GPU_SAMPLED_IMAGE` for texturing; `PROTECTED_CONTENT` "mainly used when handling DRM video". Available since API 26. [AHardwareBuffer](https://developer.android.com/ndk/reference/group/a-hardware-buffer)

**Rust access.** `jni` 0.22.4 (MIT OR Apache-2.0), `ndk` 0.9.0 (last release 2024-04-26). [jni](https://crates.io/api/v1/crates/jni), [ndk](https://crates.io/api/v1/crates/ndk). `cpal` documents `ndk_context::initialize_android_context` for JNI embedding (cpal README, below). rust-skia prebuilt Android binaries target API 26+ (below).

---

## 3. Bundled libraries versus platform decoders

### 3.1 FFmpeg

- Licence: LGPL 2.1 or later; optional GPL parts turn the whole into GPL. LGPL checklist: no `--enable-gpl`/`--enable-nonfree`, dynamic linking ("DLLs on Windows"), ship matching source and the configure line, attribute FFmpeg, do not use GPL libraries like libx264. Not available under other terms. Patent statement: the developers "don't know" whether it uses patented algorithms, cite MPEG LA as collecting for MPEG technologies. [FFmpeg legal](https://ffmpeg.org/legal.html)
- Rust bindings: `ffmpeg-next` 9.0.0 (WTFPL), updated 2026-08-05, and `ffmpeg-sys-next` 9.0.1 (2026-10-09) in `zmwangx/rust-ffmpeg`; maintainer describes it as "in maintenance mode", supports FFmpeg 3.4 through 8.0 per its README, minor versions "may include breaking changes". [rust-ffmpeg](https://github.com/zmwangx/rust-ffmpeg), [crates.io ffmpeg-next](https://crates.io/api/v1/crates/ffmpeg-next). Alternatives: `rsmpeg` 0.18.0 (MIT, last update 2025-08-24), `ac-ffmpeg` 0.19.0 (MIT), `video-rs` 0.12.0.
- FFmpeg is a library, not a player: demux, decode, and conversion are provided; audio output, A/V clocking, buffering, seeking and HLS/DASH policy are the host's work. (General architecture; not backed by a fetched page.)
- Binary size: no authoritative figure was found. Depends on the configure flags (`--disable-everything` plus selected decoders). **[unverified]**; it needs a measured build.

### 3.2 Pure-Rust and permissive C decoders

| Crate | Role | Licence | Version / last update | Notes |
|---|---|---|---|---|
| `symphonia` | Demux + audio decode | MPL-2.0 | 0.6.1, 2026-08-13 | AAC-LC "Great", MP3 and FLAC and Vorbis "Excellent", ALAC "Great"; containers MP4 "Great", MKV/WebM "Good", Ogg "Great". No video decoders. HE-AAC via adapter crates. [README](https://github.com/pdeljanov/Symphonia) |
| `rav1d` | AV1 decode (Rust port of dav1d) | BSD-2-Clause | 1.1.0, 2025-05-07 | Stable Rust on x86, x86_64, aarch64; nasm needed on x86; repo defaults to nightly toolchain. [repo](https://github.com/memorysafety/rav1d) |
| `dav1d` | Bindings to C dav1d | MIT (crate) | 0.11.1, 2025-11-25 | C library underneath. |
| `openh264` | H.264 (bindings to Cisco OpenH264) | BSD-2-Clause | 0.9.9, 2026-10-15 | Decoder: Constrained Baseline up to Level 5.2; single-thread slices. No High profile listed. [cisco/openh264](https://github.com/cisco/openh264) |
| `h264-reader`, `mp4`, `mp4parse` | Parsing only | MIT/Apache, MIT, MPL-2.0 | `mp4` last update 2023-08-01 | |
| `cros-codecs` | Hardware-assisted decode on ChromeOS/Linux | BSD-3-Clause | 0.0.6 | Pre-1.0. |
| `vk-video` | Vulkan Video | MIT | 0.3.1, 3.4k downloads | Very early. |

Gaps: no mature pure-Rust H.265/HEVC, H.264 High-profile, VP9 or AAC-with-SBR video stack was found in the crate metadata checked. A pure-Rust A/V player would therefore be assembled from several crates plus C libraries.

### 3.3 libmpv

`libmpv2` 7.0.1 (LGPL-2.1 crate), updated 2026-11-07; `libmpv` 2.0.1 (2020). mpv itself bundles FFmpeg; its licence is dependent on build and was not verified **[unverified]**.

### 3.4 Comparison: platform versus bundled

| Axis | Platform decoders | Bundled FFmpeg | Pure-Rust / permissive C |
|---|---|---|---|
| H.264/HEVC/AAC patent burden on the app | Carried by OS vendor for OS-shipped decoders (general understanding **[unverified]**) | Falls on distributor (FFmpeg legal page) | Falls on distributor; openh264 binary route offers Cisco's licence under conditions (see section 8) |
| Hardware decode | Yes, built in | Per-platform wiring needed (VideoToolbox, D3D11VA, VA-API, MediaCodec) **[unverified]** | No (software) except `cros-codecs`/`vk-video` |
| Binary size | Zero on Windows/macOS, Media3 ~3.8 MB AAR on Android, GStreamer large on desktop | Unmeasured | Small crates |
| Codec uniformity across OSes | No: sets differ by OS and version | Yes | Yes, but narrow |
| Streaming (HLS/DASH) | OS handles (variable) | Host implements or uses lavf HLS/DASH demuxers **[unverified]** | Host implements |
| Player logic (clock, sync, seek) | Provided | Host | Host |

---

## 4. Getting frames into a Skia surface

**Skia API.** `SkImages::BorrowTextureFrom(GrRecordingContext*, const GrBackendTexture&, GrSurfaceOrigin, SkColorType, SkAlphaType, sk_sp<SkColorSpace>, ...)` makes an `SkImage` from a backend texture; "borrow" leaves ownership with the caller, "adopt" transfers it; the texture must stay valid until the release proc runs. For SRGB-format textures a linear colour space should be supplied. [Skia header](https://skia.googlesource.com/skia/+/283a4045/include/gpu/ganesh/SkImageGanesh.h), [example](https://android.googlesource.com/platform/external/skia/+/a01ea49f53/docs/examples/Image_BorrowTextureFrom.cpp). The search did not surface the Graphite equivalent; whether Graphite wraps external textures the same way is **[unverified]**.

**rust-skia.** `skia-safe` 0.157.0 (MIT, updated 2026-11-03). Backends: Vulkan, Metal, OpenGL, Direct3D; examples include `metal-window` (Ganesh), `metal-window-graphite` (Graphite), `d3d-window` (Ganesh), `gl-window`, `vulkan-window`, `wgpu-window` (experimental). Prebuilt binaries: Windows x86_64/aarch64 MSVC; Linux x86_64/aarch64 GNU (glibc >= 2.31); macOS x86_64/aarch64; Android aarch64/x86_64 API 26+ (NDK r26d+ recommended); iOS device and simulators; visionOS from source only. The README does not describe wrapping foreign backend textures. [rust-skia](https://github.com/rust-skia/rust-skia), [crates.io](https://crates.io/api/v1/crates/skia-safe)

**Per platform, candidate paths** (what the verified sources support, and the gap):

| Platform | CPU path | GPU path | What is verified |
|---|---|---|---|
| Windows | `TransferVideoFrame` to WIC bitmap, then upload | `TransferVideoFrame` to a D3D11 DXGI surface, then wrap as a Skia D3D/GL/Vulkan texture | Transfer-to-DXGI is documented; the Skia-side wrapping and keyed-mutex/shared-handle details are not. This is still a GPU copy, not zero-copy. |
| macOS | `CVPixelBuffer` lock + read | `CVPixelBuffer` (IOSurface-backed) to `MTLTexture`, then Skia Metal backend texture | Pixel-buffer output is documented; IOSurface/Metal compatibility is **[unverified]**. |
| Linux | `appsink` system memory | `appsink` with GL or DMAbuf memory, imported by EGL/Vulkan | `appsink` and DMAbuf zero-copy rules verified; GL memory and import into Skia **[unverified]** (crates `gstreamer-gl` exists). |
| Android | `AImageReader` / ExoPlayer to `ImageReader` and CPU read | ExoPlayer or `MediaCodec` output `Surface`, via `SurfaceTexture` (GL external OES) or `AImageReader` to `AHardwareBuffer` to EGLImage or Vulkan external memory | `AHardwareBuffer` zero-copy GL/Vulkan binding verified (API 26+); YUV buffers need an external sampler, which is a shader-side concern for the Skia pipeline. Route from ExoPlayer output into `AHardwareBuffer` is **[unverified]**. |

Rust-side shared concern: Skia must be told the YUV or external-sampler nature of the buffer, or a conversion pass must run first. Which Skia entry points support this for each backend is **[unverified]**.

---

## 5. Audio output and A/V sync

- Windows Media Engine and macOS `AVPlayer` render audio and keep A/V sync internally; the host only receives frames. `AVPlayer` exposes `setRate(_:time:atHostTime:)` for syncing to an external clock (see 2.2).
- ExoPlayer renders audio via its own audio renderer and reports state via listener; it also supports audio offload and tunneling as track-selection preferences. [Track selection](https://developer.android.com/media/media3/exoplayer/track-selection)
- With GStreamer, `appsink` with sink sync is a property whose documentation was not covered by the fetched page; the audio branch (for example an audio sink element) is part of the pipeline **[unverified]**.
- With a bundled decoder, the host owns the audio clock. `cpal` 0.18.2 (Apache-2.0): WASAPI on Windows (default; ASIO and JACK optional), CoreAudio on macOS, ALSA on Linux (default; JACK/PipeWire/PulseAudio optional), AAudio on Android (minimum Android 8.0 / API 26, Rust 1.85; call `ndk_context::initialize_android_context` first when embedded through JNI). The README documents buffer sizes and clock query but no latency or timestamp API in the fetched text. [cpal](https://github.com/RustAudio/cpal). `rodio` 0.23.0 (MIT OR Apache-2.0) is a higher-level layer on the same ecosystem (crates.io).

---

## 6. WebVTT captions (`track`)

- WHATWG: `<track>` has `kind` (`subtitles`, `captions`, `descriptions`, `chapters`, `metadata`; default `subtitles`), `src`, `srclang`, `label`, `default`; "caption, subtitle and description tracks must be WebVTT". `TextTrack` readyState values `NONE`/`LOADING`/`LOADED`/`ERROR`. The `TextTrack.mode`/`cues` section and the rendering section were beyond the fetched text range. [HTML media elements](https://html.spec.whatwg.org/multipage/media.html)
- W3C WebVTT is a Candidate Recommendation Draft (20 May 2026). File: UTF-8, `text/vtt`, `WEBVTT` header; cues with timing line, settings (`vertical`, `line`, `position`, `size`, `align`, `region`); `REGION`, `STYLE`, `NOTE` blocks; cue tags `c i b u ruby rt v lang` and inline timestamps; tolerant parser (section 6) and rendering (section 7, CSS boxes and regions); `::cue` styling. [WebVTT](https://www.w3.org/TR/webvtt1/)
- Android: ExoPlayer handles WebVTT natively (section 2.4). Apple: WebVTT in HLS as legible options; app rendering through `AVPlayerItemLegibleOutput` (abstract verified; standalone `.vtt` loading **[unverified]**). Windows: not confirmed.
- Rust crates for parsing WebVTT: `webvtt-parser` 1.4.1 (MIT, recently updated, lives inside the `fframes` repository) is the only candidate seen; maturity and spec coverage were not checked **[unverified]**.
- Implication for a Skia host (fact, not a decision): rendering cue boxes per the WebVTT rendering rules needs a layout engine; the platform players listed deliver cue text (Apple attributed strings, ExoPlayer `Cue` objects) rather than laid-out boxes **[unverified for the Cue claim]**.

---

## 7. Streaming (progressive, HLS, DASH)

| Capability | Windows MF | AVFoundation | GStreamer | ExoPlayer | Bundled FFmpeg/Rust |
|---|---|---|---|---|---|
| Progressive HTTP | Yes (Media Engine `SetSource`) | Yes | Yes | Yes | Host-built or lavf |
| HLS | **[unverified]** | Yes (AVPlayer docs) | `hlsdemux2` | Yes, incl. LL-HLS (Apple) | Crates: `m3u8-rs` 6.0.1 (MIT), `hls_m3u8` 0.7.0 (MIT OR Apache-2.0) parse playlists only |
| DASH | **[unverified]** | **[unverified]** | `dashdemux2` | Yes | `dash-mpd` 0.21.0 (MIT) parses/downloads MPD |
| Smooth Streaming | **[unverified]** | No (general knowledge) | `mssdemux2` | Yes | none checked |
| Seeking | `SetCurrentTime`, `GetSeekable` | `seek(to:toleranceBefore:...)` | pipeline seek | `seekTo`; FLV not seekable; MP3/ADTS/AMR approximate | host |
| Live | **[unverified]** | Yes | yes | Yes | host |

Android platform requirements for progressive MP4/3GPP: `moov` before `mdat`; audio and video samples at the same time offset no more than 500 KB apart ([platform formats](https://developer.android.com/media/platform/supported-formats)).

DRM: ExoPlayer supports Widevine, ClearKey, PlayReady (Android TV). `AMediaDrm` exists in the NDK. Apple FairPlay and Windows PlayReady/Output Protection are mentioned in passing (FairPlay **[unverified]**, OPM event verified). Protected buffers cannot be CPU-read (`AHARDWAREBUFFER_USAGE_PROTECTED_CONTENT`), which constrains any Skia compositing path. DRM-in or out is not decided here.

---

## 8. Licensing and patents

| Item | Fact | Source |
|---|---|---|
| FFmpeg | LGPL 2.1+; GPL if built with GPL parts; LGPL checklist includes dynamic linking and source offer; no patent warranty | [FFmpeg legal](https://ffmpeg.org/legal.html) |
| GStreamer | LGPL core; patented codecs isolated in `ugly`; bindings `gstreamer-rs` are MIT OR Apache-2.0 | [GStreamer FAQ](https://gstreamer.freedesktop.org/documentation/frequently-asked-questions/licensing.html), crates.io |
| `gstreamer-rs` | Apache-2.0 or MIT; GStreamer >= 1.14; breaking changes follow gtk-rs six-monthly cycle; repo is a GitHub mirror of a GitLab repo | [repo](https://github.com/gstreamer/gstreamer-rs) |
| Media3/ExoPlayer | Apache-2.0; software decoder extension modules need external libraries built manually | [androidx/media](https://github.com/androidx/media) |
| Symphonia | MPL-2.0 (file-level copyleft) | [README](https://github.com/pdeljanov/Symphonia) |
| rav1d / dav1d / openh264 | BSD-2-Clause (openh264 and rav1d); `dav1d` crate MIT | repos |
| OpenH264 binary licence | Cisco's own binary is covered by Cisco's MPEG LA licence only if conditions (such as an attribution notice) are met; self-built binaries are not covered; patents outside the MPEG LA pool are not covered. This comes from 2013-2014 sources and no 2025-26 confirmation was found. | [Search results, LWN, Wikipedia summary](https://lwn.net/Articles/572205/) (secondary). Check openh264.org. |
| AVC/H.264 pool (Via LA) | Licence covers PC software, mobile devices, etc.; PC encoder/decoder per-unit fees tiered ($0 for first 100,000 units, $0.20 for 100,001-5,000,000, $0.10 above); streaming titles of 12 minutes or less carry no fee; page makes no statement about patent expiry. | [Via LA AVC](https://www.via-la.com/licensing-programs/avc-h-264/) |
| HEVC (Access Advance) | Pool licenses "Devices, Software, and Commercial Content Distribution on Physical Digital Media"; rates are not on the page; whether software decoders need a licence is not stated. | [HEVC Advance](https://accessadvance.com/licensing-programs/hevc-advance/) |
| AAC | No primary source fetched on the AAC pool or its current status. **[unverified]** | |

Not covered by any fetched primary source: whether using an OS decoder (Media Foundation, AVFoundation, MediaCodec) transfers patent obligations from the app developer to the OS vendor; this is the general expectation but needs legal confirmation. **[unverified]**

---

## 9. macOS: what is and is not verifiable without a Mac

- Compile-only checks on a macOS CI runner (build the `objc2-av-foundation` binding code, link frameworks): possible if a macOS runner is available. GitHub's hosted-runner overview page, as fetched, does not state runner labels, specs, GPU/Metal availability or audio devices for macOS; larger runners "can be powered by a GPU processor" without tying it to macOS. Whether the standard macOS runners expose a Metal device or audio output is therefore **[unverified]**.
- Behavioural verification (decode of fixtures, `copyPixelBuffer` returning frames, `timeControlStatus` transitions, seek accuracy, HLS) can in principle run headless on CI against bundled fixtures; GPU texture wrapping and real audio output cannot be assumed there.
- Everything that requires a display, DRM/FairPlay, HDR output, or perceptual A/V sync judgement cannot be verified by the author locally.
- `AVPlayer` has no software fallback: codec coverage is whatever the installed macOS version provides.

---

## 10. Rust crates and maturity (crates.io data of 2026-11-07)

| Crate | Version | Licence | Downloads | Last update |
|---|---|---|---|---|
| `windows` (Microsoft) | 0.62.2 | MIT OR Apache-2.0 | 397.6 M | 2025-10-06 |
| `objc2` | 0.6.5 | MIT | 155.6 M | 2026-10-05 |
| `objc2-av-foundation` | 0.3.2 | Zlib OR Apache-2.0 OR MIT | 2.6 M | 2025-10-04 |
| `jni` | 0.22.4 | MIT OR Apache-2.0 | 238.0 M | 2026-03-16 |
| `ndk` | 0.9.0 | MIT OR Apache-2.0 | 69.1 M | 2024-04-26 |
| `gstreamer` | 0.25.4 | MIT OR Apache-2.0 | 12.9 M | 2026-09-21 |
| `gstreamer-app` | 0.25.2 | MIT OR Apache-2.0 | 10.4 M | 2026-05-11 |
| `gstreamer-gl` | 0.25.4 | MIT OR Apache-2.0 | 1.0 M | 2026-09-21 |
| `ffmpeg-next` | 9.0.0 | WTFPL | 8.7 M | 2026-08-05 |
| `ffmpeg-sys-next` | 9.0.1 | WTFPL | 9.1 M | 2026-10-09 |
| `rsmpeg` | 0.18.0+ffmpeg.8.0 | MIT | 0.32 M | 2025-08-24 |
| `symphonia` | 0.6.1 | MPL-2.0 | 20.8 M | 2026-08-13 |
| `cpal` | 0.18.2 | Apache-2.0 | 27.8 M | 2026-08-16 |
| `rodio` | 0.23.0 | MIT OR Apache-2.0 | 13.8 M | 2026-10-11 |
| `oboe` | 0.6.1 | Apache-2.0 | 12.2 M | 2024-03-03 |
| `rav1d` | 1.1.0 | BSD-2-Clause | 0.12 M | 2025-05-07 |
| `dav1d` | 0.11.1 | MIT | 1.7 M | 2025-11-25 |
| `openh264` | 0.9.9 | BSD-2-Clause | 2.1 M | 2026-10-15 |
| `skia-safe` | 0.157.0 | MIT | 5.1 M | 2026-11-03 |
| `libmpv2` | 7.0.1 | LGPL-2.1 | 0.12 M | 2026-11-07 |
| `m3u8-rs` | 6.0.1 | MIT | 1.8 M | 2026-07-30 |
| `hls_m3u8` | 0.7.0 | MIT OR Apache-2.0 | 0.35 M | 2026-05-06 |
| `dash-mpd` | 0.21.0 | MIT | 0.45 M | 2026-10-04 |
| `webvtt-parser` | 1.4.1 | MIT | 0.057 M | 2026-11-02 |
| `video-rs` | 0.12.0 | MIT OR Apache-2.0 | 0.49 M | 2026-09-09 |
| `cros-codecs` | 0.0.6 | BSD-3-Clause | 3.7 M | 2025-06-18 |
| `vk-video` | 0.3.1 | MIT | 3.4 k | 2026-04-27 |

Source: `https://crates.io/api/v1/crates/<name>`. `vlc-rs` (2018) is stale; `libvlc-rs` does not exist under that name. No Rust crate wrapping Media Foundation's Media Engine specifically was identified; `windows` exposes the raw COM interfaces generically (the `windows` crate's Media Foundation coverage was not verified **[unverified]**).

---

## 11. Binary size

- ExoPlayer: about 3.8 MB of AAR files for exoplayer, hls, dash, common, extractor, datasource, container, decoder, database (section 2.4; pre-R8, compressed).
- GStreamer 1.28.8 distribution files (HTTP `Content-Length`, bytes): Windows MSVC x86_64 installer `gstreamer-1.0-msvc-x86_64-1.28.8.exe` 542,592,369 (about 517 MiB; it is the full runtime installer, not a minimal redistributable); Android universal tarball 1,015,174,800 (about 968 MiB, all four ABIs plus development files); macOS runtime `.pkg` 156,581,817 (about 149 MiB). These are distribution archives; the size of a pruned, shipped plugin set was not measured.
- Windows Media Foundation and macOS AVFoundation: no added binary.
- FFmpeg and Rust decoder crates: not measured. A build with a pruned decoder set would need to be produced and measured.

---

## 12. Mapping to the HTMLMediaElement surface

HTMLMediaElement members per WHATWG: `error`, `src`, `srcObject`, `currentSrc`, `crossOrigin`, `networkState` (EMPTY 0, IDLE 1, LOADING 2, NO_SOURCE 3), `preload`, `buffered`, `load()`, `canPlayType()`, `readyState` (HAVE_NOTHING 0 .. HAVE_ENOUGH_DATA 4), `seeking`, `currentTime`, `fastSeek()`, `duration`, `paused`, `defaultPlaybackRate`, `playbackRate`, `preservesPitch`, `played`, `seekable`, `ended`, `autoplay`, `loop`, `play()`, `pause()`, `controls`, `volume`, `muted`, `defaultMuted`, `audioTracks`, `videoTracks`, `textTracks`, `addTextTrack()`. Events seen in the fetched text: `abort`, `emptied`, `loadstart`, `timeupdate`, `durationchange`, `resize`, `error`; the rest of the events table was beyond the fetched range. [WHATWG](https://html.spec.whatwg.org/multipage/media.html)

Mapping (facts about what each platform exposes; "gap" means the platform API does not give the state directly):

| HTMLMediaElement | Windows Media Engine | AVPlayer | ExoPlayer / Media3 | GStreamer |
|---|---|---|---|---|
| `src`/`<source>` list | `SetSource`, `SetSourceElements` | `AVPlayerItem(url)` | `MediaItem` | `uri` property / URI handling |
| `canPlayType` | `CanPlayType` | `AVAsset` playability, codec checks (**[unverified]**) | `MediaCodecUtil` capability checks (**[unverified]**) | registry query / `GstDiscoverer` (**[unverified]**) |
| `networkState` | `GetNetworkState` | derived from item status/loadedTimeRanges (gap) | derived from player state (gap) | derived from messages (gap) |
| `readyState` | `GetReadyState` | derived from `timeControlStatus`/item status (gap) | derived from `playbackState` (gap) | derived (gap) |
| `currentTime` / seek | `GetCurrentTime`/`SetCurrentTime` | `currentTime()` / `seek(to:...)` | `getCurrentPosition` / `seekTo` | position query / seek |
| `duration` | `GetDuration` | item duration | `getDuration` | duration query |
| `buffered`, `seekable`, `played` | `GetBuffered`, `GetSeekable`, `GetPlayed` | `loadedTimeRanges`/`seekableTimeRanges` (**[unverified]**) | `getBufferedPosition` (single range) | buffering query |
| `paused`, `ended`, `loop` | `IsPaused`, `IsEnded`, `SetLoop` | `rate == 0`, end notification, host-managed loop | `playWhenReady`, `STATE_ENDED`, `repeatMode` | state, EOS |
| `playbackRate` | `SetPlaybackRate`, `SetDefaultPlaybackRate` | `rate`, `defaultRate` (**[unverified]**) | `setPlaybackParameters` | seek with rate |
| `volume`, `muted` | `SetVolume`, `SetMuted` | `volume`, `isMuted` | `setVolume` | volume element |
| `error` | `GetError`, `MF_MEDIA_ENGINE_EVENT_ERROR` | item `error` | `PlaybackException` | bus ERROR message |
| `audioTracks`, `videoTracks`, `textTracks` | `TRACKSCHANGE` event (**tracks API unverified**) | `AVMediaSelectionGroup` (**[unverified]**) | `Tracks`, `TrackSelectionParameters` | stream collection (**[unverified]**) |
| `resize` event | `FORMATCHANGE` (video) | presentation size change (**[unverified]**) | `onVideoSizeChanged` (**[unverified]**) | caps change |
| `waiting`/`stalled` | `WAITING`, `STALLED`, `BUFFERINGSTARTED/ENDED` | `timeControlStatus == waitingToPlayAtSpecifiedRate` | `STATE_BUFFERING` (**[unverified]**) | buffering messages |

Observation: only Windows Media Engine already has the HTMLMediaElement state machine (`networkState`, `readyState`, `canPlayType`, `buffered`, `seekable`, `played`, same event names). On the other three platforms the host would need to synthesise `readyState`, `networkState` and several events from lower-level notifications. For a bundled decoder stack, the entire state machine is the host's.

---

## 13. Items not verified, and open questions

Unverified items from this research (each needs a primary source before design relies on it):

1. Apple: IOSurface/Metal compatibility of `AVPlayerItemVideoOutput` buffers; display-link pull pattern; codec/container coverage; WebVTT-in-HLS behaviour and sidecar `.vtt` support; FairPlay; WebM/VP9/AV1 on macOS.
2. Windows Media Foundation: HLS/DASH/WebVTT/PlayReady support in the Media Engine; HEVC/VP9/AV1 availability; frame-server mode details (the documentation URLs tried returned 404); coverage of Media Foundation interfaces in the `windows` crate.
3. GStreamer: `GstPlay` message surface; GL memory import into Skia; subtitle element plumbing; `appsink` `sync` behaviour.
4. Skia: Graphite external-texture wrapping API; YUV/external-sampler handling on Android and Vulkan; D3D11 shared-texture import.
5. Android: NDK API levels for `AMediaCodec`/`AMediaExtractor`/`AImageReader`; route from ExoPlayer to `AHardwareBuffer` rather than a `Surface`; `Cue` object shape.
6. Licensing: AAC pool status; whether OS decoders carry the patent licence on behalf of the app; current OpenH264 binary-licence terms.
7. Measured binary sizes for pruned FFmpeg and GStreamer builds.
8. GitHub macOS runners: Metal device and audio availability.
9. The remainder of WHATWG's media event table and `TextTrack` API.

Open questions for TASK-99.17 (not answered here): which `readyState`/`networkState` semantics must be exact; whether frames must stay on the GPU on every platform; whether captions are rendered by the platform or by Gable; whether DRM is in or out of v1.

## 14. Sources fetched

- Microsoft Learn: Supported Media Formats in Media Foundation; IMFMediaEngine; MF_MEDIA_ENGINE_EVENT.
- Apple Developer documentation JSON: AVPlayer, AVPlayerItemVideoOutput, AVPlayerItemLegibleOutput (long-form text not available).
- Android Developers: supported media formats; Media3 supported formats, customization, track selection; NDK media reference; AHardwareBuffer reference; `dl.google.com` Maven artifacts.
- GStreamer: download, on-Windows, licensing FAQ, appsink, adaptivedemux2, allocation; `gstreamer-rs` repository.
- FFmpeg: legal page. `zmwangx/rust-ffmpeg` repository.
- Symphonia, rav1d, cisco/openh264, cpal, rust-skia repositories; crates.io API; Skia source (googlesource).
- WHATWG HTML media section; W3C WebVTT.
- Via LA AVC page; Access Advance HEVC page; third-party summaries of Cisco's OpenH264 binary licence (secondary, flagged).
- GitHub Docs hosted-runners overview (did not answer the macOS questions).
