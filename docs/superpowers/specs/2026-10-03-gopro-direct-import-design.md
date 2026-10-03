# GoPro Direct Import — Design (Sub-project B)

**Date:** 2026-10-03
**Covers:** #17 (raw GoPro import without HandBrake), #1 (Android picker), #18 (render progress), LRV preview reel
**Status:** Approved in brainstorming; pending spec review

## Goal

Load raw GoPro footage straight from the SD card — no HandBrake pass — edit it (on Mac or Android), and export a highlight reel **without re-encoding video**, in about a minute. Optionally produce a quick low-res preview reel from GoPro's `.LRV` proxies.

## Findings (verified 2026-10-03 on `GX010226.MP4`, HERO12 firmware `H23.01.02.40.00`)

| Property | Value |
|---|---|
| Video | HEVC Main, `hvc1`, 1920×1080, 29.97 fps, ~40 Mbps |
| Audio | AAC LC, 48 kHz stereo, ~189 kbps |
| Extra streams | `tmcd` (timecode), `gpmd` (telemetry) — must be dropped |
| Keyframe interval | 1.001 s (identical to the HandBrake preset's `keyint=30`) |
| Size | 11.9 GB for 39:30 |
| LRV proxy | `GL010226.LRV`: H.264 768×432, ~0.5 Mbps, 227 MB, **identical duration** to the MP4 |
| LRV coverage | 104/104 MP4s on the card have an LRV; 7 orphan LRVs exist |
| Native stream-copy test | `-ss … -map 0:v:0 -map 0:a:0 -c:v copy -c:a aac -bsf:v hevc_mp4toannexb -f mpegts`, TS concat, `-tag:v hvc1` → valid HEVC MP4 |
| Bundled ffmpeg.wasm | Contains `hevc_mp4toannexb`, `hevc_metadata`, HEVC parser |

What the HandBrake preset was doing (and what this design replaces): HEVC→H.264, 1 s keyframes, 7.5 Mbps bitrate, CFR 30, dropping data streams. Only the codec and bitrate matter now: keyframes are already 1 s, frame rate is already constant, and data streams can be dropped by mapping.

### Current blockers in code

- `src/utils/probe.ts` rejects any file whose `file.type` lacks `mp4` (Android SD-card files often have an empty type) and checks H.264 playability only.
- `src/components/RenderHighlights.tsx` hard-codes `-bsf:v h264_mp4toannexb` in five places and does not map streams.
- All intermediate segments and the final output live in ffmpeg.wasm MEMFS simultaneously. At 40 Mbps a 4-minute reel is ~1.2 GB, so peak memory would be ~2.4 GB+ — beyond safe browser limits, especially on mobile.

## Architecture

### Units

| Unit | Kind | Responsibility |
|---|---|---|
| `src/utils/gopro.ts` | pure util | `parseGoProName(name)` → `{ key, chapter, kind: 'full' \| 'proxy' } \| null` for `G[XH]ccnnnn.MP4` / `GLccnnnn.LRV` (case-insensitive). `pairFiles(files)` → timeline entries with `file` (playback) and optional `fullFile` (render), plus a list of unmatched proxies. Non-GoPro files pass through unpaired as `kind: 'full'`. |
| `src/utils/probe.ts` | changed | Accept by extension (`.mp4`, `.lrv`) **or** MIME. Detect codec (`avc1` vs `hvc1`) and test playability with `canPlayType('video/mp4; codecs="hvc1.1.6.L120.90"')` / `avc1` as appropriate. Return `codec` and `playable`. |
| `src/types.ts` `VideoSourceFile` | changed | Add `kind: 'full' \| 'proxy'`, `codec?: 'h264' \| 'hevc'`, `fullFile?: File`. Playback uses `file`; render uses `fullFile ?? file`. |
| `src/utils/renderPlan.ts` | pure util | `buildRenderPlan(events, files, before, after)` → `Cut[]` where `Cut = { sourceIndex, startSec, endSec }`. Merges overlaps (reuses `mergeOverlappingGoalSegments`), splits cross-file windows into two cuts, clamps to file bounds. Extracted from `RenderHighlights.tsx`. |
| `src/render/engine.ts` | interface | `renderReel(cuts, sources, opts: { quality: 'full' \| 'preview', onProgress(p: RenderProgress) }) → Promise<File \| Blob>`. `RenderProgress = { cutIndex, cutCount, fraction }`. |
| `src/render/mediabunnyEngine.ts` **or** `src/render/ffmpegEngine.ts` | implementation | Chosen by the spike (below). |
| `src/components/RenderHighlights.tsx` | changed | Buttons: **Preview reel (LRV)** and **Full-quality render**. Missing-full-file prompt. Progress `Clip 3 of 12 · 41%`. On completion: download, plus **Share** via `navigator.share({ files })` where supported. |
| `src/components/FilePills.tsx`, `EmptyPlayer.tsx` | changed | Android-friendly `accept` (see #1). Pills show badges: `proxy`, `HEVC`, `full attached`, `preview only`, `can't play here`. |

### Engine implementations

**Mediabunny (preferred if spike passes):** read packets from each source with Mediabunny's MP4 demuxer, starting at the keyframe at/before `startSec`, and write them — timestamps offset to be contiguous — into a single MP4 output via a stream target backed by an OPFS `FileSystemWritableFileStream`. Video and audio are both copied (same camera ⇒ identical AAC parameters). Memory stays flat; no MEMFS, no COOP/COEP requirement.

**FFmpeg (fallback):**
- Choose bitstream filter by codec (`h264_mp4toannexb` / `hevc_mp4toannexb`).
- Always `-map 0:v:0 -map 0:a:0` to drop `tmcd`/`gpmd`.
- Tag HEVC output `-tag:v hvc1`.
- After each segment: `readFile` → JS `Blob`, `deleteFile` from MEMFS. Final concat reads segments via a WORKERFS mount of those Blobs, so peak wasm memory ≈ one copy of the output.
- Progress computed by the app per cut (ffmpeg's own `progress` event is unreliable for stream copy).

### Data flow

1. User picks LRVs, MP4s, or both. `pairFiles` groups by recording; a playable proxy is preferred for playback, the full MP4 attached as `fullFile`.
2. Editing is unchanged — LRV and MP4 timestamps are identical.
3. Render: `buildRenderPlan` → cuts → engine reads only the required byte ranges from `fullFile ?? file` (full) or `file` (preview).
4. Edit-on-phone / render-on-Mac uses existing Project export/import; events attach to files by timeline position, and pairing makes LRV- and MP4-based timelines line up.

### Android picker (#1)

Commit `1cc062f` removed `accept="video/mp4"`. Recent Android Chrome routes `video/*`-style accepts to the system Photo Picker, which does not show USB storage. Candidate fix: `accept=".mp4,.MP4,.lrv,.LRV"` (extension-only), with no-`accept` as the alternative. Combined with the extension-based probe this should surface and accept SD-card files. **Must be verified by the user on their device**; ship whichever variant shows USB storage.

## Spike — Mediabunny viability (time-box: half a day)

Standalone page `spikes/mediabunny.html` (not shipped) that renders 10 × 14 s cuts from `GX010226.MP4` to OPFS.

Pass requires **all** of:

1. Output plays in Chrome and QuickTime; no frozen frames or A/V drift > ~1 frame at cut boundaries.
2. No re-encode: `ffprobe` shows `hevc`/`hvc1`, bitrate ≈ source.
3. Peak tab memory < ~500 MB (desktop Chrome).
4. Total time < 60 s on the user's Mac reading from the SD card.
5. LRV preview reel works on the user's Android phone (user-run).

Pass ⇒ Mediabunny engine; delete ffmpeg.wasm, `public/ffmpeg/`, and COOP/COEP headers. Fail ⇒ FFmpeg fallback engine; phone rendering limited to preview reels.

## Error handling

| Situation | Behaviour |
|---|---|
| Proxy has no matching full MP4 at render | List missing names; offer "Pick files" or "Render preview instead". |
| HEVC not playable and no LRV | Pill shows "Can't play here — add GL…LRV". File stays in timeline; events preserved. |
| Mixed codecs / audio params across sources | Detect before render. Audio mismatch ⇒ FFmpeg path with AAC re-encode. Video codec mismatch ⇒ block with message. |
| Out of memory / OPFS quota | Catch, delete partial output, report failing cut index and size so far. |
| Orphan LRV | Editable and previewable; marked "preview only"; excluded from full render with a warning. |

## Testing

- **Unit (node):** `parseGoProName`, `pairFiles` (pairs, orphans, multi-chapter e.g. `GX020238`, case variants, non-GoPro), `buildRenderPlan` (padding, overlap merge, cross-file split, clamping), probe accept rules (extension/MIME logic extracted as a pure function).
- **Component (happy-dom):** RenderHighlights missing-file prompt, progress text, preview/full buttons; engine mocked at the `renderReel` interface.
- **Not unit-tested:** engine internals (per CLAUDE.md). Covered by spike criteria and a manual check on the real file.

## Out of scope

- Native app (Capacitor + `MediaMuxer`) — revisit only if the spike fails and phone full-renders are required.
- Re-encoding of any kind for full-quality output.
- Other camera brands' proxy formats.

## Spike result

Run 2026-10-03 on the author's Mac (desktop Chromium 154 driven by Playwright, file read from the SD card at `/Volumes/GoPro`, USB). Spike: `spikes/mediabunny.html` — 10 × 14 s cuts starting at 60 s, spaced 120 s apart, snapped to keyframes (each cut became 15.015 s = 15 GOPs). Heap measured with a 100 ms `performance.memory.usedJSHeapSize` sampler (Chrome's non-precise value, so bucketed/approximate). Output pulled out of OPFS via a download and checked with native `ffprobe`/`ffmpeg` and an AVFoundation `AVAssetReader` script (same decode stack as QuickTime).

| | GX010226.MP4 (11.9 GB HEVC) | GL010226.LRV (227 MB H.264, phone stand-in) |
|---|---|---|
| Source codec string | `hev1.1.6.L153`, AAC | `avc1.64002a`, AAC |
| Total time | 10.2 s | 2.3 s |
| Peak JS heap | 159 MB | 64 MB |
| Output size / duration | 751.3 MB / 150.15 s | 13.3 MB / 150.15 s |
| ffprobe video | `hevc` / `hvc1`, 39.84 Mbps (source 39.82 Mbps) | `h264` / `avc1`, 0.52 Mbps (source 0.51 Mbps) |
| ffprobe audio | `aac` / `mp4a`, 189 kbps (stream copy) | same |
| Data tracks | `tmcd`/`gpmd` dropped (only video+audio written) | same |
| Video packets | 4500, constant 33.37 ms, 0 PTS gaps, 0 duplicate PTS, 0 non-monotonic DTS; keyframe at every cut start | same |
| Audio at cut joins | 9 joins: 8 × 4.4 ms gap, 1 × 17 ms overlap; no cumulative drift (realigned every cut); audio end 150.152 s vs video end 150.150 s | same |
| `ffmpeg -v error -f null` | 0 errors | 0 errors |
| AVFoundation decode | `isPlayable=true`, 4500/4500 frames, status completed, no error | same |
| Chrome `<video>` across each join | plays through all 9 joins, no media error, 0 dropped frames | plays through all 9 joins, no media error (1 dropped frame at one join in headless; not reproducible as a stream defect — packet checks clean) |

Criteria:

1. Plays in Chrome + QuickTime, no boundary glitches / drift > ~1 frame — **PASS** (automated: Chrome playback across joins + AVFoundation full decode + packet-timing checks; audio join error ≤ 17 ms < 1 frame). Not eyeballed/listened to by a human; a quick manual scrub in QuickTime is still worthwhile.
2. `hevc`/`hvc1`, bitrate ≈ source — **PASS** (39.84 vs 39.82 Mbps). Note Mediabunny writes `hvc1` even though the source track's codec string is `hev1`.
3. Peak JS heap < ~500 MB — **PASS** (159 MB; LRV 64 MB).
4. Total time < 60 s on the Mac from the SD card — **PASS** (10.2 s; LRV 2.3 s).
5. LRV preview works on the user's Android phone — **PENDING (user)**. Desktop LRV run passes 1–4 as a stand-in.

Decision: desktop criteria pass ⇒ Mediabunny engine (Task 7A), subject to criterion 5.
