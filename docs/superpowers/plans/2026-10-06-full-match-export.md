# Full Match Export, Kick Off / Final Whistle, Goalscorers, Captions, Score Bug — Plan (Sub-project I)

**Spec:** `docs/superpowers/specs/2026-10-05-full-match-export-design.md` (sections 1–8)
**Branch:** `feat/full-match` (worktree `../shot-stopper-i`). Baseline: 549 tests / 74 files, lint 19, tsc clean.
**Process:** red → green → commit per task. Engine behaviour kept: keyframe snapping, clamping, BLA cut starts,
open-GOP leading-picture dropping, compatibility checks, replay audio, graphics fallbacks, RGBA decode fallback.
Plain renders stay stream-copied.

## Key design decisions

- **Kick off / Final whistle are events** (`type: 'kick_off' | 'final_whistle'`, `EVENT_META[..].marker = true`).
  `matchStartTimeSec` leaves the store; `selectMatchStartSec(s)` derives it from the linked Kick off event
  (`utils/matchClock.ts › kickOffSec`). Highlights exclude markers at the root (`mergeOverlappingGoalSegments`),
  so reel, preview, strip clips and render all agree; chapters, replays, lower thirds skip them too.
- **Migration (persist v10, project import):** `matchStartTimeSec > 0` and no Kick off → a Kick off event with
  `globalTimeSec` set (time on the whole timeline). While pending it counts at that global time; as soon as loaded
  files cover it, `resolveGlobalEvents` maps it to file/time (`globalToFileTime`) and it is relinked like any event.
- **Single instance:** the picker emits a `marker` effect; `placeMarker(id, type)` drops any other marker of that
  type and strips team/person/note/replay — one undo step.
- **Full match plan** (`utils/fullMatch.ts`): cuts intersecting `[kick-off, final whistle]` (defaults: start of the
  first file / end of the last) with every file → kick-off→end of its file, whole middle files, start→whistle.
  Same engine, stream copy. Size estimate = Σ file bytes × cut fraction.
- **Engine memory:** overlays no longer read a whole cut into memory. A cut is streamed; only *regions* around
  overlay windows (one GOP before the window's GOP to two keys after its end, merged) are buffered and handed to
  `session.overlayCut` — a 45-minute file with a few score-bug windows never sits in memory.
- **Captions (§7):** `captionLayout` replaces the bottom lower third: top-left bug row (`WH 1–0 CO`, team colour
  bars, optional logo) with the event line beneath, 5 s, slide/fade 0.3 s, 1.4× scale, title-safe. REPLAY tag
  top-right at 1.4×. Setting key stays `lowerThirds` (label "Event captions").
- **Score bug (§8):** overlay kind `scoreBug` (bug row only). (Highlights "Score always on screen" and anchored captions
  were removed later.) Full match: `scoreBugWindows` (Off / After goals / Periodic) → global windows → split per cut.
- **Resumable renders (§6):** opt-in per render (`resumable: true` for full match).
  Each unit (intro card, every cut, outro card) is written as a packet log file in OPFS (`render-job/u-NNNN.bin`,
  committed on close) and the job state (signature, units done, cursor, progress, decoder configs, graphics report)
  goes to IndexedDB after each unit. Finishing muxes the logs into the MP4 (deleting each log once copied). After a
  reload the Export panel offers **Resume render** when the signature (plan + source names/sizes + graphics) matches.
  Plain highlight reels keep the direct single-pass writer.
- **Wake lock / notification:** `useWakeLock(active)`; desktop Notification when a long render finishes hidden.
- **Relink (§5):** `files/handleStore.ts` (File System Access handles in IndexedDB). `AddFilesButton` uses
  `showOpenFilePicker` when present (and drop collects handles); `RelinkBanner` in the event log when events have no
  loaded file: stored handles → one click (permission) → reopen; else → normal picker, auto-match by file key.

## Tasks

1. **Heading default MATCH** — `state.ts` (`matchdayText` → label or `MATCH`, drop `matchNumber`, migrate),
   `MatchGraphicsSetup.tsx` placeholder "e.g. Matchday 3", `graphics/plan.ts` fallback.
   Tests: state (default MATCH, New match keeps no counter), MatchGraphicsSetup placeholder, plan heading.
2. **Marker types + picker** — `types.ts`, `utils/eventTypes.ts` (`isMarker`, options K/W), `utils/eventPicker.ts`
   (`marker` effect, no further steps), `EventPicker.tsx`, `state.ts › placeMarker`.
   Tests: picker reducer K/W close with marker effect; options listed after normal types; placeMarker moves (undo).
3. **Match clock from Kick off + migration** — `utils/matchClock.ts` (`kickOffSec`, `finalWhistleSec`,
   `withMigratedKickOff`, `resolveGlobalEvents`), `state.ts` (v10 migrate, selector, remove `setMatchStartTime`),
   all readers (EventLog, EventSheet, MatchStrip, TimelineMarkers, ClipSummary, Player Home, RenderHighlights,
   ChaptersCopy, startPreview, ProjectIO), `MatchSetup.tsx` start field removed.
   Tests: matchClock unit; migration; import of old project; Match setup has no start field.
4. **Markers excluded from highlights** — `highlights.ts`, `replays.ts`, `chapters.ts`, `graphics/plan.ts`.
   Tests: merge ignores markers; wantsReplay false; chapters skip markers.
5. **Marker UI** — scrubber flags (`utils/markers.ts`), strip flags (`utils/matchStrip.ts`), event log rows,
   edit sheet for markers, scrub bubble shows match time. Tests: markers/strip units, EventLog marker row.
6. **Goalscorers + descriptions + copy buttons** — `utils/goalscorers.ts`, `utils/descriptions.ts`,
   `components/DescriptionCopy.tsx`. Tests: ordering/pens/own goals; composition; button labels and clipboard text.
7. **Captions + replay tag + score bug layouts** — `graphics/layout.ts` (`captionLayout`, `scoreBugLayout`,
   `CAPTION_SEC = 5`), `graphics/painters.ts` rows. Tests: top-left/title-safe, 768×432 legibility, long names,
   anchored bug row static, bug-only layout.
8. **Graphics plan** — captions instead of lower thirds, `scoreBug` setting (always on) with hide windows,
   `utils/scoreBug.ts › scoreBugWindows` (merge, split at goals, clamp, periodic interval, gaps),
   `fullMatchGraphicsSpec`. Tests for each.
9. **Engine: streamed overlay regions + output name** — `render/overlayRegions.ts` (pure: regions from key times),
   `mediabunnyEngine.ts`. Tests: region maths; engine behaviour verified in the browser.
10. **Full match plan + Export tabs** — `utils/fullMatch.ts`, `components/ExportPanel.tsx` (tabs),
    `components/FullMatchExport.tsx`, shared `components/useRenderRunner.ts`. Tests: cut plan (both markers across
    files, missing markers, single file), size/duration; Export tabs component test.
11. **Resumable renders** — `render/packetLog.ts` (record encode/decode, pure), `render/renderJob.ts`
    (OPFS + IDB), engine units, Resume UI, cancel. Tests: packet log round trip; job signature; resume offer states.
12. **Wake lock + notification** — `components/useWakeLock.ts`, `utils/notify.ts`. Tests: hook acquire/release/
    re-acquire; render panel message.
13. **Relink** — `files/handleStore.ts`, `components/RelinkBanner.tsx`, `AddFilesButton`, `EmptyPlayer` drop.
    Tests: banner states (supported + stored handles vs not), handle store with fakes.
14. **Browser verification** (scratchpad/fullmatch, scratchpad/design i-*.png) and docs.

## Test cases (summary)

- goalscorers: score line `Whites 3–2 Colours`; order by goals desc then name; `(1 pen)`; own goals line; no teams.
- descriptions: highlights = score, blank, chapters, blank, scorers; full match chapters from kick-off (+ card).
- fullMatchCuts: kick-off in file 1 & whistle in file 2; both in one file; no markers; whistle before kick-off.
- scoreBugWindows: periodic every N min, kick-off 8 s, gap 8 s, goals 10 s; overlap merge; split at goal; clamp.
- migration: v9 state with matchStartTimeSec 600 → kick-off event pending at 600 → resolved when files load.
- picker: K → close + marker effect; second Kick off moves the first (one undo restores).
- overlayRegions: window → [key before window's key, two keys after end]; merging; cut start inside region.
- packetLog: records round-trip across chunk boundaries.
