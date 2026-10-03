# Slow-mo Replays — Design (Sub-project E)

**Date:** 2026-10-03
**Covers:** #14 slow-motion replays of part of a highlight
**Status:** Approved in brainstorming
**Depends on:** sub-project B's Mediabunny engine (`src/render/mediabunnyEngine.ts`, `renderReel`) and C's event types (`isScoring`).

## Behaviour

| Setting | Default | Configurable |
|---|---|---|
| Which events get a replay | Scoring events (goal incl. pen, own goal) | Per-event toggle (↻ on the event row) overrides the default either way |
| Replay window | 3 s before → 1 s after the marked moment | Clip settings: "Replay before" / "Replay after" (seconds) |
| Speed | 0.5× | Clip settings: 0.5× or 0.25× |
| Placement | Immediately after the event's normal clip (after the merged segment containing it) | — |
| Sound | Silent | — |

- No re-encoding of video. A replay re-emits the same encoded packets with timestamps and durations scaled by `1 / speed`. Works for any source frame rate (30 fps → effective 15 fps at 0.5×; 60 fps → 30 fps).
- Replay windows snap to keyframes like normal cuts (start at the key packet at/before `moment − before`; end at the next key packet after `moment + after`), so a "3 s before / 1 s after" replay may be up to ~1 s longer at each end with GoPro's 1 s GOP.
- Silent audio: the output audio track gets silent AAC frames covering the replay's (stretched) duration, so the audio track stays continuous for players. Silent frames are produced by encoding a short run of zero samples once per render (Mediabunny `AudioSampleSource` / WebCodecs `AudioEncoder` with the source's sample rate and channel count) and repeating the encoded frame with advancing timestamps. If the browser has no AAC encoder, omit audio packets for the replay (the gap is accepted) and log a warning.
- Preview reel (LRV) and full render both include replays.
- Chapters: highlight chapters account for replay duration (each replay adds `(window length) / speed` seconds after its event's segment). YouTube full-match chapters are unaffected.

## Data and units

- `MatchEvent.replay?: boolean` — explicit override; `undefined` means "use the default for this type".
- Store settings (persisted): `replayBeforeSec` (3), `replayAfterSec` (1), `replaySpeed` (0.5).
- `wantsReplay(event): boolean` (pure, `src/utils/replays.ts`) = `event.replay ?? isScoring(event)`.
- `Cut` (`src/render/types.ts`) gains optional `speed?: number` (default 1) and `silent?: boolean`.
- `buildRenderPlan` gains a `replays` option: after the cuts for each merged segment, append one replay cut per event in that segment that `wantsReplay`, with `speed`, `silent: true`, window clamped to the file (replays never span files; if the window crosses a file boundary, clamp to the event's own file).
- Engine (`mediabunnyEngine.ts`): for a cut with `speed ≠ 1`, packet timestamp = `cursor + (p.timestamp − cutStart) / speed`, duration = `p.duration / speed`; cursor advances by `(cutEnd − cutStart) / speed`. For `silent` cuts, write silent audio frames instead of source audio.
- `GoalList`: ↻ toggle per event row (filled when `wantsReplay`), click flips `replay` to the opposite of the current effective value.
- `ClipSettings`: replay before/after inputs and speed select.
- `generateHighlightChapters`: add replay durations.

## Testing

- Unit: `wantsReplay` (default by type, override both ways); `buildRenderPlan` replay cuts (placement after the segment, merged segments with two goals → two replays, clamping to file, no replay when disabled, speed/silent set); highlight chapter offsets including replays.
- Component: GoalList ↻ toggle; ClipSettings replay inputs update the store.
- Engine: not unit-tested (CLAUDE.md). Verified by rendering a generated test file with one replay and checking with ffprobe: total duration = clips + replay/speed; video packets in the replay section have doubled spacing at 0.5×; audio track continuous (or documented gap); decode with `ffmpeg -v error -f null -` clean; plays in QuickTime and Chrome.

## Out of scope

- "REPLAY" caption or any visual overlay (requires re-encode).
- Slowed audio (requires re-encode).
- Frame interpolation.

## Verification

2026-10-03, branch `feat/replays`, system Chrome (headless, Playwright `channel: 'chrome'`; WebCodecs `AudioEncoder` reports `mp4a.40.2` 48 kHz stereo supported). Test media: 120 s `testsrc2` + 440 Hz sine at 29.97 fps, keyframe every 30 frames (1.001 s): `GX010009.MP4` (HEVC `hvc1`, closed GOP, no B-frames) and `GL010009.LRV` (H.264). Loaded the LRV, marked a goal at 60 s with G → Enter → Esc (row ↻ shows pressed by default), rendered the preview reel, attached the MP4 via the missing-files prompt, rendered full quality, then switched Replay speed to 0.25× and rendered again.

| Output | Duration | Video packet spacing (clip / replay) | Audio | Replay level | `ffmpeg -v error` | AVFoundation |
|---|---|---|---|---|---|---|
| Preview (H.264, 0.5×) | 25.025 s = 15.015 clip + 10.010 replay | 33.36 ms / 66.73 ms | 1173 packets, continuous to 25.024 s, no joins off by > 0.5 ms | −91 dB (digital silence); clip −21 dB max | clean | playable, 600 frames, monotonic |
| Full (HEVC, 0.5×) | 25.025 s | 33.36 ms / 66.73 ms | 1173 packets, continuous | −91 dB | clean | playable, 600 frames |
| Full (HEVC, 0.25×) | 35.035 s = 15.015 + 20.020 | 33.36 ms / 133.46 ms | 1642 packets, continuous to 35.029 s | −91 dB | clean | playable, 600 frames |

- Keyframe snapping as designed: clip 50–64 s → 49.049–64.064 s (15.015 s); replay window 57–61 s → 56.056–61.061 s (5.005 s), ×2 at 0.5× and ×4 at 0.25×.
- Chrome `<video>`: all three load, seek into the replay (18 s) and play with 0 dropped frames.
- Gap fallback (`AudioEncoder` deleted via init script, engine called directly with clip + replay + clip): logs `Replay audio: no AAC encoder, leaving a gap`; the muxer represents the gap by stretching the last pre-replay audio packet (duration 10.05 s), the replay window decodes 0 audio samples, the following clip's audio stays in sync at 25.0 s; decode clean; AVFoundation plays it (30.03 s, 750 frames).
