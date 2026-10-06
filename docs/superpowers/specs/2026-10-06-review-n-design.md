# Review Round N — Design

**Date:** 2026-10-06
**Source:** user review (15 items). Split into N1 (engine & graphics) and N2 (UI & data) for two parallel implementers.

---

## N1 — Engine & graphics

### N1.1 Full-match crash on file joins (user #14) — BUG
- Evidence (`~/Downloads/full-match.mp4`): one VPS/SPS/PPS (first file's, in the sample entry) for the whole track; footage copied from the 2nd file has no in-band parameter sets, so decoders apply the 1st file's PPS ("cu_qp_delta outside the valid range"), corrupting frames and crashing QuickTime/Preview.
- Fix: whenever a render uses more than one source **or** any generated segment, every key frame carries its source's parameter sets in-band and the sample entry is the covering SPS (the spike's rules, already implemented for graphics in `src/render/nal.ts`: `withInbandParams`, `pickSampleEntry`, `covers`). Apply in the plain stream-copy path too (cheap; no re-encode). Single-source plain renders may stay as they are.
- `assertCompatible` also compares coded width/height (and profile/chroma/bit depth); mismatches go to N1.2 instead of producing a broken file.
- Verify: two generated HEVC files with **different encoder settings but the same size** (e.g. x265 `--qp`/`cu-qp-delta` differences, different `init_qp`) joined → `ffmpeg -v error` clean, AVFoundation full decode, scrub across the join in Chrome.

### N1.2 Mixed frame sizes (user #15)
- Output size = the first used source's size (most common if tied). Sources with a different size have their cuts **re-encoded** through the graphics session: decode → draw scaled to cover the output and centre-cropped (aspect preserved) → encode with the output's codec settings and colour tags.
- Cards and captions are always generated at the output size, so they no longer fail with "the clips have different frame sizes".
- Before rendering, show which file will be re-encoded and an estimate ("GX020227.MP4 is 3840×2160; it will be scaled to 1920×1080 — about N min"), with Render / Cancel. Same check for highlights (usually only a few seconds per clip).
- Verify: 1080p + 4K (or 2.7K) test files → full match and highlights; decode clean; frames from the 2nd file look correct (look at them).

### N1.3 Caption & label sizes (user #8a)
- Reduce caption panel, score bug, REPLAY tag and lower-third text/panel sizes by 25 % (scale factor in layout), keeping title-safe margins and centring rules.

### N1.4 Continuous score pill across clip → replay (user #8b)
- When an event's caption/score pill is visible at the end of its clip and the next cut is that event's replay, keep it on screen continuously (no fade-out/in, no gap at the join). Plan overlay windows across adjacent cuts as one logical window; the GOP re-encode covers both sides of the join.

### N1.5 Highlight captions at the start (user #9)
- Event captions for match events (goal, own goal, penalties, save, foul) keep showing 1 s after the event (current behaviour).
- `highlight` events: caption shown at the **start of the highlight's clip** for 5 s, with the note text ("HIGHLIGHT · Sam — nutmeg on the wing"); with no note, just "HIGHLIGHT" (plus person if set).

### N1.6 Defaults (user #7, #11)
- `graphics.replayTag` default **on**.
- Full-match score bug default **After goals** (users who explicitly chose otherwise keep their choice).

### N1.7 Multicoloured team colour in graphics (user #5, graphics side)
- Team colour value `'multi'` (set by N2) renders as a multicolour pattern: in card shields, caption/score-bug team stripes and colour dots — diagonal stripes of 4–5 bright colours (e.g. #e63946, #f4a261, #2a9d8f, #457b9d, #f1fa8c); initials drawn white with a dark outline for legibility. Pure helper `teamFill(color)` → solid or pattern descriptor; painters handle both.

---

## N2 — UI & data

### N2.1 Goal areas named by team (user #1)
- Boxes and labels are "Whites' goal" / "Colours' goal" (team names from Match setup; defaults "Team 1's goal" / "Team 2's goal"), not left/right — the camera may see them top/bottom. Setup: two boxes, each labelled with the team that **defends** it at kick-off; a swap button ("Swap which goal is whose").
- Replay framing options in the edit sheet: "<Team 1>'s goal", "<Team 2>'s goal", Full frame, Custom (+ zoom).
- Data: `goalAreas: { team1?: CropRect; team2?: CropRect }` (migrate from left/right + `whitesAttackLeft`: the box Whites attacked towards becomes Team 2's goal, etc.).
- Default zoom target per event type (pure `replayGoalFor(event, teams, halfTimeSec) → 'team1' | 'team2' | 'full'`):
  - Goal, Goal (pen), Penalty awarded, Penalty missed → goal **defended by the other team** (the team attacks it).
  - Own goal → goal defended by the team that conceded = the one the credited team attacks (same as a goal for the credited team).
  - Save → goal **defended by the saving team** (its own goal).
  - Foul, Highlight → Full frame (location unknown) unless set manually.
  - After a Half time marker (N2.2), ends swap.
- Resize handles: visual dot ~12 px, hit area ~28 px (user: current ones too big); keep keyboard resize and any-corner resize.

### N2.2 Half time marker (user #2)
- New single-instance marker type **Half time** (key **T** in the type step; Match group in the touch list, between Kick off and Final whistle). No halves are assumed unless it exists. Shown as a flag on scrubber/strip and a row in the log; chapters get "Half time" line; excluded from highlights.
- Its presence feeds `replayGoalFor` (ends swap after it). Remove the "second Kick off swaps ends" rule and the Match setup attack-direction copy that implied halves.

### N2.3 Space bar (user #3)
- Space toggles play/pause wherever focus is, except text inputs/textareas/contenteditable and the open picker's text step. Including when the event log has focus.

### N2.4 Close buttons (user #4)
- All ✕ close buttons (sheets, panels, menus, dialogs): icon ≥ 20 px, hit area ≥ 44 px, consistent component.

### N2.5 Multicoloured colour option (user #5, UI side)
- Match setup colour swatches gain a multicolour swatch (conic/striped fill) stored as `'multi'`; dots and team chips render it as the pattern (CSS). Graphics handled in N1.7.

### N2.6 Stable timestamp width (user #6)
- All running time displays (player time, scrub bubble, strip label, event times) use tabular figures and a fixed format per match length: `mm:ss` with leading zero always ("04:05"), `h:mm:ss` when the match is ≥ 1 h — chosen once per project so the width never changes while scrubbing; reserve width with `ch`-based min-width.

### N2.7 Goalscorers & descriptions (user #10)
- Copy goalscorers lines: `Name: 2 ('13, '44)`; penalties `('13, '44 pen)`; own goals `Own goals: Ade ('30, for Whites)`. Minute = whole minutes since kick-off + 1 (football convention), from match clock.
- Highlights and full-match descriptions include a **Goalscorers** heading above the same list.

### N2.8 File numbers and [ ] (user #12, #13)
- File pills and the Files sheet show the order number before the name ("1 · GX010226.MP4").
- `[` / `]` jump to previous / next file (restore; respects text inputs).

---

## Testing (both)
- Unit tests for every pure function named above; component tests for UI behaviour; real-render verification for N1 with generated media (delete large media after); screenshots for N2 at 390×844, 844×390, 834×1194, 1440×900 with touch emulation where relevant.
