# Teaser ("Coming up") and event marks — design

Date: 2026-11-05 · Decided with the user in conversation; my own calls are marked **(agent call)**.
Mockups: https://claude.ai/artifact/PLgt4dv94gJG6fQ7hCg8hH (private to the user).

## Intent

A highlights video should open with a taste of what's coming: one or more marked moments, played before the match
starts, under a "COMING UP" banner and without giving the score away. Starring happens in the Events list against any
event. The way it's marked must leave room for other marks later (goal of the season / month), which will collect
moments across matches; those are **not** built now.

Separately, the user noticed long notes are cut short in captions ("…HIS LACES…" loses "(FORESHADOWING)"). The note box
allows 200 characters while the caption shows 60. Decision: the box allows exactly what the caption shows, and the
caption shows all of it.

## Goals

1. Star any non-marker event (goal, save, foul, highlight…) as a teaser; several can be starred.
2. The highlights video opens: teaser clips (match order) → VS card (when on) → highlights as today → full-time card.
3. Each teaser clip is that event's whole highlight clip (same padding as its clip later in the reel), stream-copied/
   re-encoded like any other cut. The teaser moments still appear again in their normal place.
4. Over a teaser clip: a "COMING UP" caption in the event caption's position, no score bug, no minute, no team/score.
5. Export → Highlights shows the teaser and can leave it out of one render without unmarking.
6. Notes: the input limit equals what the caption can show; captions wrap the note onto two lines instead of cutting it.

## Non-goals (now)

- Goal of the season / month or any cross-match collection (only the data shape and the menu leave room for it).
- Editing a teaser's length or in/out points (user: "leave it out for now").
- Teasers in the full match export or single-clip downloads (they ignore marks).
- Reordering teasers by hand (match order only).

## Anti-goals

- Giving the result away: no score bug, score, minute or team name anywhere on a teaser clip.
- Cluttering the Events row: one new button, not one per mark kind.
- Breaking saved projects, transfer links or the render rules in AGENTS.md §5 (stream copy first, QuickTime-safe splices).

## Decisions

### Data
- `MatchEvent.marks?: EventMark[]` with `type EventMark = 'teaser'` for now (a list, not a boolean, so later marks are
  additive) **(agent call)**. Absent = no marks. Persisted with the event, so it is in project JSON, transfer links and
  match records automatically; `sanitiseEvents()` drops unknown mark values (so a future mark loaded by an old build is
  dropped quietly rather than breaking) and dedupes.
- Persist version bump (v28) only if the builder needs a migration; an optional field on events may not need one —
  builder's call, but import/transfer decode must keep `marks`.
- Markers (Kick off / Half time / Final whistle) can't be marked.
- Store: `toggleMark(eventId, mark)`; undoable like other event edits.
- Export setting `highlightsTeaser: boolean` (default true), persisted with the other export settings.

### Events list (option B, chosen by the user)
- **Word (user): "Star".** The app tags moments, never "marks" them (AGENTS.md voice rule); the UI says Star / Starred.
  Code keeps `marks` as the data name.
- The selected row's action line (`EventActions`) gets **★ Star** between Framing and the download slot. It opens a small
  popover menu with one checkbox item: "Teaser (top of video)". Ticking toggles the mark; the menu stays open.
- Starred rows show a small ★ after the event name (`aria-label` "Starred: teaser"). Not lime (lime is goals/primary only)
  **(agent call)**: use the muted text colour.
- Icon-only on narrow rails like the other actions; ≥ 44 px on touch; fits the existing 3 + 2 touch wrap (now 3 + 3 —
  builder to check 361–440 px rails and 360 px icon-only).
- Keyboard: a row shortcut for the menu, a key not already used (see `utils/shortcutList.ts`; e.g. `S` is taken by save in
  review — builder picks and adds it to the list) **(agent call)**.
- Also in the edit sheet? No (keep one place) **(agent call)**.

### The teaser in the video
- Teaser cuts = for each marked event, in whole-timeline order, **its own padded window** (lengthBefore … lengthAfter,
  clamped to its file, no replay), planned without merging in unmarked neighbours **(agent call: a marked save next to an
  unmarked goal must not show the goal)**. Marked events whose windows overlap merge into one teaser clip.
- A merged teaser clip shows the first marked event's caption until 1 s before the next marked event's moment, then
  that one's **(agent call)**. Unmarked events inside a teaser clip get no caption.
- No cap on the number of teasers **(agent call)**; the Export row shows the total length so a long teaser is visible.
- Order in the output: teaser cuts → intro (VS) card → reel cuts → outro. **The engines currently always put the intro
  first** (`mediabunnyEngine` and `transcodeEngine`): this needs a small, explicit way to place the intro after the
  teaser cuts (e.g. a `introAfterCut` index on the plan/graphics). This is the riskiest part; keep it one field, used by
  both engines, the timeline (`onTimeline`), chapter times and the unit cache keys.
- Caption over each teaser clip (user): the lime slab says **COMING UP** in place of the event word, and the event goes on
  the line below it: `GOAL · DAN`, `PEN GOAL · DAN`, `PENALTY CONCEDED · A LO`, `SAVE · JO` (event word + named player,
  or the event word alone when nobody is named). A **Highlight** shows its note as that line instead, with no
  "HIGHLIGHT" prefix (wrapping to two lines like any note; a highlight with no note shows the player, else "HIGHLIGHT").
  Other events' notes are **not** shown in the teaser (so "makes it 3–2" can't give the score away). No bug, minute,
  assist or team colour (neutral stripe) **(agent call on assist and stripe: the team colour can hint at who scores)**.
- The banner stays up for the whole teaser clip, fading in/out like captions **(agent call; user didn't pick between
  whole clip and 5 s)**. Cost: in Original each teaser clip is re-encoded in full (~14 s of footage each), noticeably
  slower on phones; the time estimate must include it.
- No REPLAY tag (no replay cut), no score bug.
- Look: the event caption's shapes as today: lime COMING UP slab (for every event type) on the first row, then a
  second row in the name-bar style carrying the event line above (event word in the stadium voice at the note size,
  `·`, name in the shirt voice) or the highlight's note. tnf gets it by its palette remap; classic
  uses its own caption with the same text swap. No new shapes. Bump nothing by hand (`RENDER_VERSION` hashes graphics).
- Persist: v28 migration adds `highlightsTeaser: true` **(agent call)**.

### Notes
- Caption note: up to 2 lines, wrapped at word boundaries, at the current note size; the caption box grows by one note
  row when it wraps. Only text that cannot fit two lines gets "…" (old saved notes over the limit).
- `NOTE_MAX` (new shared constant, utils): the number of characters that always fit two caption lines in the widest
  glyphs of the shirt font at note size, within the caption's max width. Expected ≈ 100; the builder measures it
  (uppercase W-heavy worst case) and rounds down **(agent call: the exact number is measured, not guessed)**.
- Every note input (`EventPicker`, `TagColumn`, `EventSheet`, `EventLog` inline edit) uses `maxLength={NOTE_MAX}` and shows
  a quiet counter "84 / 100" once within 20 characters of the limit (text-ui-xs, muted).
- Chapters keep their own 40-character cut (`shortNote` in chapters) — YouTube chapter titles stay short.
- Pasted/imported notes longer than `NOTE_MAX` are kept as they are (no data loss) and cut with "…" only where shown.

### Export panel (Highlights tab)
- In "Clips & replays": a row "Teaser" with a switch, summary "2 moments · 28 s"; when nothing is marked the row reads
  "None starred: use ★ Star on an event" and the switch is hidden.
- The disclosure's one-line summary mentions the teaser when on.
- Reel length, size and time estimates include the teaser cuts (they are ordinary cuts in the plan).
- The teaser setting and the marked event ids are part of the plan signature (resume / saved parts / unit cache).

### Preview and chapters
- Preview in player (`utils/preview.ts`) plays the teaser steps first; jumping to an event's row goes to its reel clip,
  not its teaser copy.
- Highlight chapters: "00:00 Coming up", then the first event chapter at the start of the reel proper (after the VS card),
  every chapter shifted by the teaser + card length. Exact times come from the real timeline as today.
- File name unchanged.

## Testing
- Utils: marks sanitising; teaser cut planning (order, merge, unlinked/missing files skipped, no replay); plan signature
  changes with marks/toggle; chapters with a teaser; `NOTE_MAX` fits two lines with the real font metrics (canvas measure
  test or a recorded width table).
- Components: ★ Star menu toggles and shows ★ on the row; export row on/off/none; counters on each note input.
- Graphics: render frames of a teaser caption (each theme), a two-line note caption, and confirm no bug/minute.
- Real renders of generated media (Original and 1080p): teaser before the VS card, `ffmpeg -v error` clean, AVFoundation
  decodes to the end (the session's `avcheck` approach), frames inspected at the teaser → card → reel joins.

## Left to the builder
- Exact placement of the intro after the teaser in both engines, and how the timeline/chapter code learns about it.
- Whether a persist migration is needed.
- The shortcut key, popover component reuse, exact counter threshold styling.
- Measuring `NOTE_MAX`.
