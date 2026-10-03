# Events & Match Setup — Design (Sub-project C)

**Date:** 2026-10-03
**Covers:** #3 event types, #4 team quick-pick, #5 roster, #6 match start marker, #7 timeline icons; plus fullscreen container fix (prerequisite for overlay controls in fullscreen) and restoring YouTube chapter output.
**Status:** Approved in brainstorming
**Depends on:** sub-project A (merged). Independent of B except `FilePills.tsx` (Match button placement).

## 1. Event types

```ts
export type EventType =
  | 'goal' | 'own_goal'                       // scoring
  | 'penalty_awarded' | 'penalty_missed'      // non-scoring
  | 'highlight' | 'foul' | 'save'             // non-scoring
```

- Penalty scored = `type: 'goal'` + `pen: true` (new optional field on `MatchEvent`).
- `team` on a scoring event is always the team **credited** with the goal. For an own goal, `scorer` is a player from the *other* team.
- Legacy types migrate: `moment` → `highlight`, `card` → `foul`. Persisted store version bumps 8 → 9; Project import uses the same `migrateEvent()` util.
- `src/utils/eventTypes.ts` (pure) owns per-type metadata: label, picker key, icon, colour, `scoring`, `needsTeam`. Replaces `eventColors.ts` (its tests move over).

| Type | Picker key | Label in chapters | Icon | Scores | Team/scorer step |
|---|---|---|---|---|---|
| goal | G / Enter | `Goal` | ⚽ | ✅ | ✅ |
| goal + pen | P | `Goal (pen)` | ⚽ with P badge | ✅ | ✅ |
| own_goal | O | `Own goal` | ⚽ red ring | ✅ (credited team) | ✅ (scorer from other team) |
| penalty_awarded | A | `Penalty awarded` | Ⓟ | ❌ | team only |
| penalty_missed | X | `Penalty missed` | Ⓟ struck | ❌ | ✅ |
| highlight | H | `Highlight` | ★ | ❌ | ❌ |
| foul | F | `Foul` | 🟨 | ❌ | ❌ |
| save | S | `Save` | 🧤 | ❌ | ✅ |

## 2. Event picker (G → type → team → scorer)

- **G** (keyboard), **+ Event** button (desktop bar), or **＋** (mobile overlay, also in fullscreen) creates the event **immediately** as a goal at the current time, then opens the picker for that event id. Nothing is lost if the picker is ignored.
- Steps:
  1. **Type** — list from §1, Goal preselected. Enter or a type key selects. ↑/↓ move. Backspace deletes the just-created event and closes. Esc closes (keeps goal).
  2. **Team** (if `needsTeam`) — the two team names from Match setup with shortcut letters from `teamShortcuts()` (first distinguishing letter, case-insensitive). Typing filters; Enter selects highlighted. Esc skips (closes).
  3. **Scorer** (if type has scorer step) — text field filtering that team's roster (other team's roster for own goal) by word prefix. Enter selects highlighted match, or if no match adds the typed name to the roster and uses it. Esc skips.
  4. Close.
- Steps skipped when no teams are configured (type step only).
- State machine is a pure reducer: `src/utils/eventPicker.ts` — `pickerReducer(state, input) → { state, effects[] }` where effects are `update`, `remove`, `addToRoster`, `close`. The component applies effects to the store. All keyboard behaviour is unit-tested through the reducer.
- While open, the picker captures keys in a window capture-phase listener (`stopImmediatePropagation`) so videojs-hotkeys (F, M, arrows, etc.) don't fire.
- Video keeps playing; the event time is fixed at creation.
- Each picker change is a normal `updateEvent` (one undo step per change). Acceptable for now.
- Desktop: compact popover anchored over the bottom-left of the video. Mobile (≤768px): bottom sheet with large chips; scorer step shows a text field plus chips for matches.
- Replaces: `AddGoalBar` team/scorer inputs (bar becomes time + **+ Event (G)**), and `FullscreenControls`' add-goal modal.

## 3. Match setup (teams, rosters, start)

- **Match** button beside the file pills opens a panel (modal on desktop, sheet on mobile):
  - Two teams: name, colour (6 preset swatches), roster textarea (one per line or comma-separated; pasted WhatsApp lists work — `parseRoster()` trims, de-dupes case-insensitively, drops empty and leading list markers like `1.`, `-`, `•`).
  - Match start: time input + **Use current time** (sets `matchStartTimeSec` to the current global timeline position).
- Store: `teams: [Team, Team]` where `Team = { name: string; color: string; roster: string[] }`. Default `[{ name: 'Whites', … }, { name: 'Colours', … }]` with empty rosters.
- Teams persist (in `partialize`) and are **not** cleared by `clear()` — same squads most weeks. Included in Project export/import (optional field; old exports still import).
- Renaming a team updates `team` on existing events with the old name (`renameTeam` action).
- `MatchEvent.team` stays a name string (compatible with existing data and exports).

## 4. Match start marker (#6)

- `matchStartTimeSec` is global-timeline seconds (as used by chapters).
- A green ⚑ marker on the scrubber of the file containing that time.
- **Home**: if the match start is in the current file and the playhead is more than 0.5 s after it, jump to the start marker; otherwise jump to 0.
- Chapters and event clock use the match start (existing `adjustTimestampsByOffset` behaviour).

## 5. Timeline markers (#7)

- `TimelineMarkers` component renders via React portal into the video.js `.vjs-progress-holder`.
- `markersForFile(events, fileIndex, durationSec, teams, matchStartSec, cumulativeOffsets)` (pure) → `{ id, leftPct, icon, color, title, kind: 'event' | 'start' }[]`. Linked events only. Colour = team colour if set, else type colour. Title = `23:41 Goal – Whites (Sam)`.
- Click a marker → `seekToGoal(file, time − lengthBeforeGoalSec)`. Markers don't block scrubbing between them (small hit area, `pointer-events: auto` only on the marker).

## 6. Fullscreen container fix

- Fullscreen targets the app's `.player-container` (video + overlays + picker), not video.js's own element. Applies to: control-bar fullscreen button, **F** key, double-click on video.
- `toggleContainerFullscreen(el)` helper (DOM side effect; lives in `src/components/fullscreen.ts`, not utils). Uses `requestFullscreen` / `webkitRequestFullscreen`; exits with `exitFullscreen`.
- Existing `isFullscreen` tracking keeps working (listens to `fullscreenchange`).
- Done when: in fullscreen, the speed indicator, overlay buttons, ＋ and the picker are visible and usable.

## 7. Chapters and scores

- `generateYouTubeChapters` / `generateHighlightChapters`: label from `eventTypes` (`Goal (pen)`, `Own goal`, `Highlight`, …). Running score shown and advanced only on scoring events; final score line counts scoring events only. Format otherwise unchanged (`23:41 Goal (pen) 1-0 (Whites) Sam`). Non-scoring: `23:41 Penalty missed (Whites) Sam`, `23:41 Highlight`.
- Team order in score: Match setup order (team 1, team 2) instead of alphabetical, when teams are configured; alphabetical fallback for legacy.
- `OutputPanel` score counts use `isScoring()`.
- Output panel gets **Copy YouTube chapters** and **Copy highlight chapters** buttons (copy to clipboard, "Copied" feedback). Minimal UI; D redesigns.

## Testing

- Unit (node): `eventTypes` metadata and `isScoring`; `migrateEvent`; `pickerReducer` (every key path in §2 incl. Backspace delete, Esc at each step, skip when no teams, own-goal roster swap, add-new-scorer); `teamShortcuts` (distinct first letters, shared first letters, single team); `filterRoster` (word-prefix, case-insensitive); `parseRoster`; `markersForFile` (file boundaries, start flag placement, unlinked excluded, colours); chapters (new labels, pen, own goal, non-scoring no score change, team order).
- Store: `teams` defaults, `renameTeam` updates events, `clear()` keeps teams, migration v8→v9.
- Component (happy-dom): `EventPicker` renders steps and applies effects (G→Enter adds goal; G→H highlight; G→W→"sa"→Enter sets team and scorer); `MatchSetup` saves teams/rosters; `AddGoalBar` button opens picker.
- Manual (Playwright, desktop + 390px): marker icons positioned and clickable; Home behaviour; fullscreen shows overlays and picker; picker swallows F/M while open.

## Out of scope

- Two cameras / auto camera select (#8/#9), redesign (#11, D), zoom (#12, D).
- Merging consecutive picker edits into one undo step.
