---
id: TASK-99.15
title: Media playback on the four platforms
status: Done
assignee: []
created_date: '2026-11-07T22:47:00Z'
updated_date: '2026-11-07T22:53:00Z'
labels:
  - wayfinder:research
dependencies: []
parent_task_id: TASK-99
ordinal: 212000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Gable Native v1 includes video, audio, track and source elements. What can play media on Windows, macOS, Linux and Android from a Rust host: platform decoders (Media Foundation, AVFoundation, GStreamer or equivalent, MediaCodec/ExoPlayer) versus a bundled library (FFmpeg or pure-Rust decoders), and how does each produce frames for a Skia-drawn surface, sync audio and video, support captions (WebVTT for track), streaming (HLS, DASH, progressive), DRM (out or in), seeking, and the HTMLMediaElement event and property surface? Facts and comparison only: codec and container coverage, licensing (LGPL, GPL, patents), binary size, Rust crates, macOS verification limits (the author cannot test on a Mac), and Android constraints. No decision.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-07T22:53:00Z

---

Resolved: findings pushed to branch research/native-media-playback (commit 3d55dba), file docs/research/native-media-playback.md. Facts and comparison only, no decision. Highlights: (1) Only Windows Media Engine already mirrors the HTMLMediaElement state machine (events below 1000 are the HTML5 events; TransferVideoFrame copies to a DXGI surface); on macOS, Android and GStreamer, readyState/networkState and several events must be synthesised by the host. (2) macOS gets frames as CVPixelBuffer via AVPlayerItemVideoOutput; WebVTT only confirmed via HLS legible output; no software fallback, and CI-only verification of GPU/audio is unconfirmed. (3) Android: ExoPlayer/Media3 (Apache-2.0, ~3.8 MB AARs) covers HLS, DASH, WebVTT, Widevine; NDK has only low-level MediaCodec/MediaExtractor; AHardwareBuffer gives zero-copy to GL/Vulkan (API 26+). (4) Linux: GStreamer (LGPL core, patented codecs in ugly, hlsdemux2/dashdemux2, appsink, DMAbuf) vs FFmpeg (LGPL only if dynamic, no GPL parts) vs pure-Rust (symphonia audio only; rav1d AV1; openh264 Constrained Baseline only; no mature Rust H.264 High/HEVC/VP9). (5) Licence/patent: H.264 (Via LA) and HEVC (Access Advance) obligations fall on the distributor for bundled decoders; OpenH264 Cisco binary terms need current confirmation. Gaps are listed in section 13 as unverified: Apple long-form docs (client-rendered), MF HLS/DASH/WebVTT and frame-server details (404s), Skia Graphite external textures, AAC pool, measured FFmpeg/pruned GStreamer sizes. No instructions were found in any fetched web content.

---
<!-- COMMENTS:END -->
