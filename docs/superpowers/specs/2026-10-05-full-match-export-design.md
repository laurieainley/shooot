# Full Match Export, Kick Off / Final Whistle, Goalscorers — Design (Sub-project I)

**Date:** 2026-10-05
**Source:** user requests after G/H.

## 1. Card heading default

- Title card heading: if the Matchday field is empty, the card says **MATCH**. The input shows "e.g. Matchday 3" as a placeholder only. Remove the auto-incrementing matchday number (and its bump on New match).

## 2. Kick Off and Final Whistle markers

- Two special event types in the ＋ picker, listed after the normal types: **Kick off** (key K) and **Final whistle** (key W; type-step keys don't clash with team shortcuts, which only apply in the team step). Single-instance: marking a second one moves the existing marker (with undo).
- They have no team/person/text steps, never score, never get replays/lower thirds, and are not highlights (excluded from the highlight reel and highlight chapters).
- Shown on the scrubber and match strip as flags (green kick-off, chequered final whistle) and in the event log as distinct rows.
- **Kick off replaces "Match start" in Match setup.** `matchStartTimeSec` is derived from the Kick off marker (global time); the Match setup start field and "Use current time" button are removed. Migration: a persisted `matchStartTimeSec > 0` with no Kick off event becomes a Kick off event at that global time (mapped to file/time via cumulative offsets when files load; until then stored with `sourceFileIndex` from the offsets known at migration, relinked like other events).
- Home jumps to Kick off (as before with match start).

## 3. Export: Highlights vs Full match

- Export panel gets two tabs/sections: **Export highlights** (current reel: preview reel, full render, graphics toggles) and **Export full match**.
- Full match = all loaded files concatenated in timeline order, trimmed to start at Kick off and end at Final whistle (if absent: start of first file / end of last file). Stream copy, no re-encode, same engine (cuts: kick-off→end of its file, whole middle files, start of last file→final whistle). Optional VS card at the start and FT card at the end when cards are enabled (reuses G).
- Shows estimated output size (sum of byte ranges) and duration before rendering; warns on phones when > 2 GB.
- Proxy timelines: full match uses full files (missing-files prompt as for highlights); preview-quality full match from LRVs allowed.
- Output name `full-match.mp4` (`highlights.mp4` for the reel).

## 4. Copy buttons

- **Copy highlights description** (YouTube description for the highlights video): final score line, blank line, highlight chapters, blank line, goalscorers.
- **Copy full match description** (YouTube description for the full match video): final score line, blank line, chapters timed from Kick off (video starts at kick-off), blank line, goalscorers.
- **Copy goalscorers**: score line then scorers by goals descending, ties alphabetical; penalties counted as goals and marked, own goals listed separately:

```
Whites 3–2 Colours

Sam Taylor 2 (1 pen)
Priya 1
Jo Smith 1
Alex Wu 1
Own goals: Ade (for Whites)
```

- Pure util `goalscorers(events, teams) → { scoreLine, lines }` in `src/utils/goalscorers.ts`; descriptions composed by `src/utils/descriptions.ts`.

## 5. Relinking files after a reload (answer + feature)

- Browsers don't let a page keep access to files picked with a normal file input. On **desktop Chrome/Edge** the File System Access API (`showOpenFilePicker`) returns file handles that can be stored in IndexedDB; after a reload a **Relink files** button asks for permission once (one click) and reopens them. Not available on Android Chrome or Safari.
- Implement: when supported, pick files via `showOpenFilePicker` (multiple, video types) and persist handles per project; on load, if events exist and files are missing, show a **Relink files** banner: desktop → one click (permission prompt), otherwise → opens the normal picker and auto-matches by name (existing relinking by file key).

## Testing

- Unit: goalscorers ordering/pens/own goals; descriptions composition; full-match cut plan (kick-off/final-whistle across files, missing markers); migration of matchStartTimeSec → Kick off event; picker reducer for K/Q types (no further steps; single instance moves).
- Component: Export tabs; copy buttons labels and content; Match setup without start field; heading placeholder/default MATCH; relink banner states (supported vs not).
- Browser: render a full match from two generated files with kick-off in file 1 and final whistle in file 2; verify duration and ffmpeg decode clean; phone portrait/landscape screenshots of Export tabs and picker with the new types.

## 6. Rendering on phones: wake lock and resumable renders (user: "Sure")

- While any render runs, hold a Screen Wake Lock (`navigator.wakeLock.request('screen')`, re-acquire on `visibilitychange` back to visible) and show "Keep this screen open until the render finishes". Release on finish/cancel/failure. No-op where unsupported.
- Resumable renders: the engine records progress per completed cut (cut index, output bytes written, cursor timestamps, audio state) in IndexedDB next to the OPFS output; if the page is frozen/discarded/reloaded mid-render, the Export panel offers **Resume render** (same project, same files relinked) which continues from the last completed cut. If the plan or files changed, offer only a fresh render. Desktop: show a Notification when a long render finishes while the tab is hidden (permission requested on first long render).

## 7. Event caption position and timing (user: goal label up top, 2 s longer)

- Move event captions from the bottom lower third to a **top-left score-bug** style caption (TV convention: score bug top-left): team initials + score (`WH 1–0 CO`) with the event line beneath (`GOAL · Sam Taylor`, `HIGHLIGHT · Jo — nutmeg on the wing`). Non-scoring events show the current score too.
- **REPLAY** tag moves to **top-right** (broadcaster convention), so captions and the replay tag never overlap.
- Caption on screen for **5 s** (was 3 s), same slide/fade in and out. Re-encoded GOP window grows accordingly.
- Title-safe margins (5 %) kept; sizes per the polish pass's ~1.4× scale-up.
