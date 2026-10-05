# Event Details & Running Score — Plan (Sub-project H)

Spec: `docs/superpowers/specs/2026-10-05-event-details-score-design.md`. Red-green TDD per task; commit after each.

## Task 1 — Per-type picker options (`src/utils/eventTypes.ts`)
- `PickerOption` gains `personLabel?: string`, `personOptional: boolean`, `teamOptional: boolean`, `askText: 'prompt' | 'optional' | false`, `textLabel?: string`.
- Highlight and foul: `askTeam: true`, `teamOptional: true`, `askScorer: true`, `personOptional: true`; highlight `askText: 'prompt'` ("What happened"), foul `askText: 'optional'` ("Note").
- Save: person optional ("Goalkeeper"). Labels: Scorer / Penalty taker / Own goal by / Taker / Goalkeeper / Who / Committed by.
- `shortNote(notes, max = 40)` and `eventSummary(e)` → `Highlight · Sam — nutmeg on the wing`.
- Tests: labels per option; highlight/foul ask team + text; summary with/without scorer and note; long note shortened with an ellipsis.

## Task 2 — Picker reducer (`src/utils/eventPicker.ts`)
- New step `'text'`. After the person step (or when skipped, or after a team for options without a person) go to the text step when `askText`, else close.
- `SKIP` choice (`'__skip__'`) and the Tab key skip an optional team / person step. Skipping the team goes straight to the text step (no roster without a team).
- With no teams configured, highlight/foul go straight to the text step.
- Text step: typed text kept in `query`; Enter saves `notes` and closes; Escape (and touch Done, which dispatches Escape) saves non-empty text and closes.
- Tests: per-type paths (goal, pen, own goal from the other roster, save skip, highlight team → who → text, highlight skip team → text, foul with note, no teams → text), Esc keeps text, empty text writes nothing.

## Task 3 — Picker UI (`src/components/EventPicker.tsx`, `App.css`)
- Person input labelled with `personLabel`; Skip chip on optional team / person steps; text step input (`aria-label` = text label) with placeholder by `askText`.
- Done on touch dispatches Escape so typed text is kept; Cancel still deletes.
- Tests: per-type label, Skip chip, text step saves on Enter and on Done, update existing "highlight with H closes" test to the new flow (H → team step).

## Task 4 — Running score utils (`src/utils/score.ts`)
- `scoreAt(events, teams, offsets, globalSec): [number, number]`, `finalScore(events, teams)`, `scoresAfter(events, teams, offsets): Map<id, [n, n]>`.
- Scoring + linked only; team order from Match setup; own goals credited to `team`; event at exactly t counts.
- Tests: before kick-off 0–0, own goals, unlinked excluded, multi-file offsets, inclusive boundary, unknown team ignored, running scores in time order regardless of array order.

## Task 5 — Score badge at playhead (`ScoreBadge.tsx`) + fullscreen chip (`FullscreenControls.tsx`)
- Badge shows score at the playhead; final in brackets when different (`Whites 1–0 Colours (3–2)`), compact shows the bracket too.
- Fullscreen: compact chip top-left.
- Tests: bracket only when different; follows `currentTimeInFileSec` and file offsets.

## Task 6 — Event log (`EventLog.tsx`)
- Row label via `eventSummary`; note span; N key / double-click note edits the note inline (Enter saves, Esc cancels, empty clears).
- Scoring rows show the score after the event (`2–1`), small tabular.
- Tests: running score on scoring rows only; note shown; N edits note.

## Task 7 — Labels elsewhere (`chapters.ts`, `markers.ts`, `matchStrip.ts`)
- Chapters: `12:04 Highlight (Whites) Sam: nutmeg on the wing`. Marker / strip titles include the short note.
- Tests in each util's test file.

## Task 8 — Match setup hint
- "Teams and rosters are remembered for next time." (one line, MatchSetup). Test: hint visible.

## Verification
- `npx tsc -b`, `npm run build`, `npm run test:run`, lint count ≤ baseline (19).
- Playwright (system Chrome, port 5182): phone portrait/landscape (touch) and desktop flows; screenshots `h-*.png`.
