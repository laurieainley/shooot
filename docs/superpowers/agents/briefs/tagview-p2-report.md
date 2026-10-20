# Report: tag view phase 2 (feat/tag-view-2) — Find goals on the timeline (touch)

Status: done to a green commit; leftovers below.

## Built
- `utils/foundMoments.ts` (+test): moment window (8 s before to 3 s after the estimate), `momentAt`, `momentAfter`, `momentPosition`, chip text, `findGoalsChip` state (idle / running / found "6 found · 3 top picks" / checked "All found moments checked").
- `components/foundMoments.ts`: `jumpToMoment` (6 s before, plays), `rejectMoment` (decideSuggestion reject, "Discarded 00:09" + Undo toast, jump to next pending or pause), `useCurrentMoment`.
- `FindGoalsChip` (top right in the overlay, a row of the band in portrait) + `FindGoalsLine` (thin progress line on the timeline while running). Tap opens `FindGoalsSheet`.
- `FindGoalsSheet`: on touch, panel `'review'` renders this short sheet instead of the review card (start form `MatchRangeStep`, progress, stale, summary + gap lines, Find goals again, Details). It closes when a run starts. All existing entry points (menu, prompt, summary) therefore work unchanged. Desktop still renders `SuggestionReview`.
- `TagControls`: found-moment chip ("★ Top pick · 3 of 7 · 12:34" / "Found moment · …", read-only) and "✕ Not a goal" under Tag, only while the playhead is on a pending moment. In the band the chip overlays the chip row (no layout shift).
- Tag on a moment confirms it: `EventPicker.finish` links the pending moment under the event time (touch view only; goal/own goal/save/highlight), toast "… confirmed at …" with Undo.
- Rings: tap on touch jumps to the moment (desktop still opens the review). Scrubbing unchanged.
- Removed on touch: Review (N) fullscreen button (code deleted), rail "Review moments" button and Find goals progress line in the events list, review card. Speed buttons dropped in the overlay; a Speed row (0.25 0.5 1 1.5 2) sits at the top of the touch ⋯ menu (`registerPlayerRate`). Lock kept.
- `useAllGoalsToast` moved to its own file and called from `TagControls`, so "All N goals tagged" still appears without the card.

## Red -> green
Helper tests were written with the helpers (not strictly red first). Behaviour tests: `FoundMoments.test.tsx` (chip and Not a goal only on a moment, reject + undo + jump to 6 s before next, pause when none left, top pick label, chip opens the sheet not the card, not-run form, all-checked summary, desktop still has the card), `EventPicker.test.tsx` (tag on a moment confirms; far tag does not), `FullscreenControls.test.tsx` (Review (N) tests replaced: no Review button, no speed buttons, chip, lock kept).

## Checks
vitest 233 files / 2638 tests pass; tsc 0; build 0; eslint 11 problems (baseline 11); contrast all pairs >= 4.5. Lime guard untouched (stars use text colour).

## Screenshots looked at (Android Chrome UA, 30 s generated clip, seeded suggestions; scratchpad tagview2-shots/)
844x390 dark and light (found chip, on top pick with Not a goal, after Not a goal toast, after tag on moment, chip sheet, menu with speeds), 915x412 (not-run start form sheet, done summary sheet, speeds menu), 390x844 (band, found chip row, Top pick row, Not a goal), 412x915, 834x1194, 1194x834 (on top pick), desktop 1280x800 (review card unchanged, no tv elements). Note: "light" in the touch view is the dark scope from Phase 1, so light shots match dark in the overlay; portrait page shows light theme.
Verified by script: Found jump lands ~6 s before; Not a goal rejects and jumps to the next; tagging on moment 2 turned it kept with an event.
NOT done: real run in progress screenshot (the 30 s clip finished before capture; running label covered by unit test only), 1920 desktop, touch fullscreen real, all-checked chip shot beyond the sheet.

## Deviations / concerns
- Not a goal sits under Tag, so Tag moves up ~50 px while on a moment (as the prototype). Could cause a mis-tap; real-device check.
- Chip meaning: star only when top picks exist.
- Sheet text "N to check: use ◀ Found / Found ▶ …" duplicates the summary's "N not reviewed" line.
- After Edit event from a state where the Find goals sheet was open, `returnTo` may reopen it (rare).
- Detection completion no longer opens anything on touch; the chip updates only.

## Proposed AGENTS.md text
"Find goals on touch (2026-10-20): in the touch view (`useTagViewMode() !== 'off'`) there is no review card, Review (N) button or rail Review button. `FindGoalsChip` (top right / band) shows not run / % / "N found · M top picks" / "All found moments checked"; tapping opens `FindGoalsSheet` (panel `'review'` renders it on touch: start form, progress, summary). Found moments are pending suggestions: rings on the strip (tap = jump 6 s before), ◀ Found / Found ▶, and while the playhead is in a moment's window (`utils/foundMoments.ts`, -8…+3 s) a read-only chip plus ✕ Not a goal (`rejectMoment`: reject, Undo toast, next moment or pause). Tagging on a pending moment links it (`EventPicker.finish`). Speeds live in the touch ⋯ menu."
## Proposed DECISIONS.md text
"2026-10-20 (agent, per approved spec): Phase 2 built: on touch Find goals is a chip + sheet, found moments are reviewed by watching (jump, Tag confirms, Not a goal rejects); review card kept on desktop only. Speed control moved into ⋯ on touch. Spec: 2026-10-20-unified-tag-review-design.md."

## Real device needed
Tag moving when Not a goal appears; chip legibility over bright footage; ring tap vs scrub on a phone; real Find goals run on GoPro footage.
