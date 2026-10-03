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
