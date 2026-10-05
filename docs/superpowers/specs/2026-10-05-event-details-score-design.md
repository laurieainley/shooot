# Event Details & Running Score — Design (Sub-project H)

**Date:** 2026-10-05
**Source:** user review items #15 (per-type data entry), #17 (score at a timestamp with final in brackets), #14 (teams persist — already true; keep).
**Status:** Proposed in conversation, user asked to proceed ("keep going on all this").
**Builds on:** C's picker reducer (`src/utils/eventPicker.ts`), F's picker sheet (Done/Cancel).

## Per-type details (#15)

| Type | Team step | Person step (label, roster) | Text step |
|---|---|---|---|
| Goal | Team credited | **Scorer** (team roster) | — |
| Goal (pen) | Team credited | **Penalty taker** (team roster) | — |
| Own goal | Team credited | **Own goal by** (other team's roster) | — |
| Penalty awarded | Team awarded | — | — |
| Penalty missed | Team | **Taker** (team roster) | — |
| Save | Team saving | **Goalkeeper** (team roster), optional | — |
| Highlight | Team (optional) | **Who** (team roster), optional | **What happened** (free text, optional, prompted) |
| Foul | Team committing | **Committed by** (team roster), optional | **Note** (optional) |

- Person stays in `scorer` (no schema change; label varies by type). Text goes in `notes`.
- Text step: single-line input, Enter saves and closes, Esc/Done closes keeping what's typed, Cancel deletes the event (from F).
- Every step remains skippable (Esc on desktop, Done on touch), keeping the "mark first, refine optionally" principle.
- `PICKER_OPTIONS` gains `personLabel` and `askText: 'prompt' | 'optional' | false`; highlight and foul gain `askTeam: true` with a visible "Skip" option on the team step.
- Event log row and chapter/marker labels include the person and a shortened note: `Highlight · Sam — nutmeg on the wing`, chapters `12:04 Highlight (Whites) Sam: nutmeg on the wing`.
- Event log inline edit (E/T keys from D) extends to the note (N key / double-click).

## Running score (#17)

- Pure `scoreAt(events, teams, cumulativeOffsets, globalTimeSec) → [number, number]` and `finalScore(...)`; scoring events only, linked only, team order from Match setup.
- **Top bar score badge** shows the score at the playhead with the final in brackets when different: `Whites 1–0 Colours (3–2)`. Updates as playback moves (throttled to timeupdate).
- **Event log**: scoring rows show the score after that event (`2–1`), small, tabular.
- Fullscreen: a compact score chip (top-left) mirrors the badge so it's visible while watching.

## Teams (#14)

Already persisted across sessions in localStorage and kept by New match. Add a one-line hint in Match setup: "Teams and rosters are remembered for next time."

## Testing

- Unit: `scoreAt`/`finalScore` (own goals credited, unlinked excluded, multi-file offsets, before kick-off); picker reducer paths per type (labels, roster source, text step, skip on team step for highlight/foul); label formatting with notes.
- Component: picker shows per-type person label and text step; score badge shows `(final)` only when different; event row shows running score for scoring events.
- Browser: phone portrait/landscape flow for highlight with team → who → text; badge updates when seeking.
