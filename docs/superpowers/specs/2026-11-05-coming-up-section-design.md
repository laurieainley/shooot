# Coming up section — editable teaser moments — design

Date: 2026-11-05 · Builds on `2026-11-05-teaser-and-marks-design.md` (live on main 9c5c8c1). Decided with the user in
conversation; my own calls are marked **(agent call)**. Mockup: https://claude.ai/artifact/PLgt4dv94gJG6fQ7hCg8hH (v2).

## Intent

A starred moment's teaser often wants different words and timing from its place in the highlights ("LAURIE WAITS
PATIENTLY FOR HARRY TO DO HIS LACES (FORESHADOWING)" instead of "HIGHLIGHT · LAURIE"). Give every starred moment its own
entry in a **Coming up** section at the top of the Events list, where its teaser caption, length, slow-mo replay and replay
framing can be set — without touching the same moment later in the highlights.

## Decisions (user)

- Starring a moment adds an entry to a "Coming up" section at the top of the Events list; unstarring removes it.
- Each entry has its own caption, slow-mo replay on/off, replay framing (zoom, same tool as other events), seconds before
  and seconds after. They override the automatic "GOAL · DAN" line and the match's clip settings, for the teaser only.
- The same moment later in the highlights is unchanged by anything set on its teaser entry.
- Confirmed guesses: section header "★ COMING UP · N moments · S s"; entries in match order showing the caption as it will
  read; the selected entry's action line has Replay · Edit · Framing · Unstar; Edit opens a short sheet (caption with the
  100-character box + counter, seconds before / after, replay switch); Framing opens the existing framing view for the
  teaser's replay; a new entry starts empty (automatic caption, replay off, the match's clip seconds, the moment's own
  framing); a filled caption replaces the automatic line (a Highlight's note is then ignored for the teaser); unstarring
  deletes the entry's edits (undo restores them; starring again starts fresh); the moment keeps its ★ in the main list;
  each teaser moment plays as its own clip even when two overlap.

## Non-goals

- Reordering teaser moments by hand (match order only).
- Cross-match marks (goal of the season) — still later.
- Changing the reel, full match or clip download.

## Data **(agent calls on shape)**

- `MatchEvent.teaser?: TeaserEdit` where `TeaserEdit = { caption?: string; beforeSec?: number; afterSec?: number;
  replay?: boolean; replayCrop?: ReplayCrop }`. Absent fields = defaults (automatic caption, the match's
  `lengthBeforeGoalSec` / `lengthAfterGoalSec`, replay off, the event's own `replayCrop` / automatic framing).
- Lives on the event so it travels with project JSON, transfer links and match records. `sanitiseEvents` keeps it only
  while the event is starred `'teaser'`; trims caption to `2 * NOTE_MAX`; clamps seconds 0–15 like the replay window;
  drops unknown keys. Unstar (`toggleMark` removing `'teaser'`) deletes `teaser` in the same undo step. `placeMarker`
  deletes it too.
- Store: `setTeaserEdit(eventId, patch: Partial<TeaserEdit>)` (undoable; empty caption string = unset).
- Persist: no shape migration needed for an optional event field; bump to v29 only if the builder needs one.

## Planning

- `teaserEvents` unchanged. Teaser windows: each starred event gets `[t − before, t + after]` from its `teaser` overrides
  (else the match's clip seconds), clamped to its file, **one clip per event, never merged** (user: each plays as its own
  clip). Cross-file splitting as today.
- Teaser replay (when `teaser.replay`): the slowed replay cut follows that teaser clip, using the match's replay window /
  speed / gain and `teaser.replayCrop ?? event.replayCrop ?? automatic` framing (same `replayOptionsFor` / `cropFor` path
  as the reel). The REPLAY tag shows over it like any replay **(agent call)**; the COMING UP banner covers the normal-speed
  clip only **(agent call)**.
- Caption: `teaser.caption` (uppercased, wrapped with `wrapNote`) replaces the automatic line when non-empty.
- `teaserClips` grouping stays (one group per clip; a clip's replay cut is not part of the banner group).
- Chapters, preview, Export "Teaser" row length, signatures and the engines' `introAfterCut` keep working from
  `highlightsCuts` (teaser cuts now include any teaser replays). Preview plays teaser replays at their speed.

## UI

- **Events list:** when anything is starred, a section above the match events: header row `★ COMING UP` + `N moments · S s`
  (muted), then one row per starred moment (clock · team dot · the caption as it will read, shirt font; Replay ↻ when on).
  A thin divider, then the usual list (header "Match" **(agent call)**). Nothing starred → no section.
- Selecting a teaser row expands its action line: Replay switch (teaser's) · Edit · Framing (disabled while its replay
  is off) · ★ Unstar. ▶ on a teaser row plays its teaser clip (preview of just that step) **(agent call: jumps to the clip
  start in the player if a preview isn't running)**.
- Keyboard: ↑/↓ move through teaser rows then match rows as one list; R/E/Enter/Delete work on teaser rows (Delete =
  Unstar); S on a match row still opens the Star menu.
- **Edit sheet** (`TeaserSheet`, same sheet chrome as Edit event): title "Teaser: <event label> · <clock>"; Caption field
  (placeholder = the automatic line; `maxLength={NOTE_MAX}` + `NoteCounter`); Seconds before / after (number fields, the
  match's values as placeholders, 0–15); Slow-mo replay switch; a "Reset to automatic" quiet link.
- **Framing:** opens the existing replay framing view for the teaser (`editEvent(id, 'framing', { target: 'teaser' })`
  or equivalent); it reads/writes `teaser.replayCrop`; the reel's framing is untouched.
- Touch: rows and actions as the main list (44 px); the sheet is full-screen on phones like Edit event.

## Testing

- Utils: sanitise (kept only while starred, trimmed, clamped); unstar drops edits in one undo step; teaser windows use
  overrides, never merge, cross-file split; teaser replay cut + crop override; caption override; reel unchanged by any
  teaser edit (deep-equal reel cuts/spec); signatures change with each override.
- Components: section appears/disappears; row shows caption; action line; sheet edits each field; Framing edits only the
  teaser crop; keyboard through both sections.
- Real renders (generated media, Original + 1080p) with a teaser replay and a cropped teaser replay: ffmpeg clean,
  `scripts/avcheck.swift` clean, frames looked at.
- Screenshots at the five sizes, dark + light, touch for phone/tablet.

## Left to the builder

- Component split (`TeaserSection`, `TeaserRow`, `TeaserSheet`), how the framing view is told its target, whether a
  migration is needed, exact divider/header styling within the tokens.
