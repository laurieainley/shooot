# Match Graphics — Design (Sub-project G)

**Date:** 2026-10-05
**Covers:** #23 lower thirds, #24 title (VS) and full-time cards with fades; builds on #22 replay audio (F).
**Basis:** spike `docs/superpowers/specs/2026-10-05-title-cards-spike.md` (branch `spike/title-cards`, commit ddfb003) — generated segments can be spliced into stream-copied footage in one MP4 track without re-encoding the footage, given three rules (parameter sets on every key frame; sample entry = the SPS that covers the other in coded size and DPB; card colour tags = footage colour tags). Verified on ffmpeg, AVFoundation and Chrome; YouTube/Android pending the user's test.
**Depends on:** F (engine audio changes) and H (event person/notes) merged first.

## What the viewer sees

1. **VS card** (4 s, fade in/out from black): league logo, "MATCHDAY n" heading, two shield badges in team colours with initials, team names with colour underline, orange/blue base bar — the user's design (`01a_vs.png`).
2. Highlights, each scoring/annotated event with a **lower third** for 3 s starting at the marked moment: event label (GOAL / GOAL (PEN) / OWN GOAL / SAVE / HIGHLIGHT / FOUL / PENALTY MISSED), person, optional note, and for scoring events the score after it (`RR 1–0 WT`). Slides/fades in over 0.3 s, out over 0.3 s. Styled to match the cards (navy panel, orange accent, condensed display type, team-colour stripe).
3. Replays optionally get a small "REPLAY" tag (same mechanism as lower thirds, off by default).
4. **Full-time card** (4 s): same layout with "FULL TIME" and the final score (`01b_ft.png`).

## Settings

- Export panel → **Graphics**: toggles for "Title & full-time cards" (default on once configured) and "Lower thirds" (default on), "Replay tag" (default off).
- Match setup gains: **Matchday** label (free text, default "MATCHDAY {n}" with n auto-incrementing per New match, editable), team **initials** (auto from names: first letters of up to two words, editable), logo (defaults to the bundled T.N.F badge; replaceable by picking an image; stored in IndexedDB).
- Whites / Colours presets: team colour white `#f0f0f0` with navy initials; Colours default `#ec5fa4` with white initials (matches the design).

## Rendering architecture

- Card and overlay drawing: pure layout functions return draw-op lists (`src/graphics/layout.ts`: `vsCardLayout`, `ftCardLayout`, `lowerThirdLayout` → `{ kind: 'rect'|'text'|'image'|'shield', ... }[]` in a 1920×1080 design space, scaled to output size). A thin canvas painter executes them (`src/graphics/paint.ts`). Layout functions are unit-tested (text fitting, initials, score strings, safe areas).
- Fonts: Bebas Neue (display) loaded via FontFace before rendering; fallback condensed system font.
- Encoder: `src/render/segmentEncoder.ts` — WebCodecs `VideoEncoder` configured from the footage track (codec string, coded size, fps, colour space), key frame at segment start, parameter sets kept in-band; checks the "covers" rule and retries once with alternative settings (e.g. lower `reference` count via `latencyMode: 'realtime'`), else throws `GraphicsUnsupported`.
- Engine: new cut kinds
  - `{ kind: 'generated', durationSec, frame: (t) => DrawOps }` → encoded segment + silent audio (cards).
  - `{ kind: 'overlay', sourceIndex, startSec, endSec, overlay: (t) => DrawOps }` → the GOPs overlapping the overlay window are decoded (`VideoDecoder`), painted, re-encoded and spliced; GOPs outside are copied. Audio is copied unchanged.
- Sample-entry selection per the spike's `auto` rule; every key frame (copied and generated) carries VPS/SPS/PPS in-band (`withParameterSets(packet, config)` helper).
- If graphics fail for any reason, the render falls back to the plain reel and the result panel says which graphics were skipped and why.

## Performance targets

- Cards: < 3 s each at 1080p on the user's Mac.
- Lower thirds: ~3–4 GOPs per event re-encoded; target < 2 s per event at 1080p.
- Phone: graphics allowed for LRV preview reels; for full 1080p HEVC on phone show an estimate and allow turning graphics off.

## Testing

- Unit: layout functions (initials, fitting long names like "RYAN'S ROVERS", score strings, own goal credited side), cover-rule selection, in-band parameter-set insertion (byte-level on fixture NAL units), overlay GOP window selection.
- Integration (browser, headless system Chrome): render a reel with VS card, two lower thirds, a replay and FT card from generated HEVC and H.264 media; verify with ffmpeg (no errors), AVFoundation full decode, Chrome playback across all joins; extract frames at each lower third and card and inspect them.
- User: YouTube unlisted upload and Android playback of a real GoPro reel.

## Open questions for the user (non-blocking defaults chosen)

- Lower thirds on which events: default goals, own goals, penalties (scored/missed) and highlights with a note; saves and fouls off.
- Card durations: 4 s each (setting later if needed).
