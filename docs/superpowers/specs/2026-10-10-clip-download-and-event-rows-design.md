# Clip download and calmer event rows — design

Date: 2026-10-10 · Status: approved in conversation, awaiting written-spec review

## Why

Players want to share a single moment (their goal, a save) without the whole reel. The events rail is also busy:
each row carries an assist line, a file tag and four action buttons. Making room for a per-event Download is the
moment to move secondary actions out of the row.

Out of scope (parked in `docs/superpowers/notes/ideas.md`): vertical (9:16) clips and automatic reframing (ball /
player tracking). The description tidy-up (no assists, no scorer minutes, team abbreviations) is a separate bounded
change on `feat/description-tidy`.

## Decisions (from the user)

- A clip download is that event's part of the reel: the clip (clip padding before/after) followed by its slow-mo
  replay when it has one, with its caption. **Score** and **Replay** are options.
- Every clip ends with a **Shooot sting** of about 3.5 s.
- Options live in a **small popover on the Download button** (Score, Replay, Download), remembered for next time.
- The **selected row expands** to show an action row; one open at a time. On touch a tap expands instead of opening
  the edit sheet directly.
- Rows: smaller text, **no assists**, **no V1/V2 file tag**, score kept, note kept.

## 1. Event rows

**Main row:** clock · team dot · icon · name (shirt font, 1 px smaller than today) · note (inline, muted, truncated)
· score · ▶ Watch. Marker rows: clock · flag · label · ▶.

- Removed: the assist line (`eventRowParts` no longer returns it), the `V1`/`V2` file tag. The unlinked-file
  warning stays (it is a state the user must act on), shown in the main row where the file tag was.
- Desktop text drops by 1 px across the row (clock, name, score); touch keeps ≥ 14 px.

**Action row** (only under the selected row, full row width, indented to the icon column):

| Action | Shown for | Behaviour |
|---|---|---|
| ↻ Replay | non-marker events | toggles the slow-mo replay (same as R), `aria-pressed` |
| ⌖ Framing | when Replay is on, desktop and touch | opens framing (today's ⌖) |
| ✎ Edit | all | opens the existing edit sheet (`editEvent`) |
| ⬇ Download | non-marker events, linked to a file | opens the clip popover (§2) |
| × Delete | all | deletes (same as ⌫) |

- Labels: icon + short text on desktop when the rail is wide enough (container query), icon-only with `aria-label`
  and tooltip when narrow. Touch targets ≥ 44 px.
- Selection: click, ↑/↓ or a freshly tagged event selects and expands. Esc collapses (keeps selection on the row
  for keyboard users). Touch: tap selects + expands; Edit is one more tap.
- Keyboard: unchanged shortcuts in the focused log (Enter watch, ⌫ delete, R replay, E/T/N edit). Tab from the
  list moves into the action row of the selected event; Shift+Tab returns.
- Brand: chalk icons; lime only on the popover's Download button. No new colours; tokens only.

## 2. Clip download

### Plan
`clipExport(state: ExportState, eventId: string, opts: { replay: boolean; score: boolean }, quality): ExportPlan`
in `src/utils/exportPlans.ts`:

- Segment: that event alone through `mergeOverlappingGoalSegments` (so padding and file-boundary splitting behave
  exactly like the reel), then `buildRenderPlan` with replay options only when `opts.replay` and
  `wantsReplay(event)`.
- Graphics: `buildGraphicsSpec` gains `captionEvents?: Set<string>` (caption only these events; the score is still
  computed from all linked events, so a goal shows the score after it) and `captionScore?: boolean` (false = the
  caption is built without the score). No title or full-time card. REPLAY tag follows the user's graphics setting.
  `outro` becomes the sting (below). Event captions follow the user's caption setting; if captions are off the clip
  has none.
- Sources: `resolveRenderSources` as for the reel (full files when attached, else proxies with the existing
  "preview quality" handling).
- Output name: `<home>-<away>-<minute>-<type>[-<person>].mp4`, lower-case, ASCII, from team initials, the match
  minute, a short type slug (`goal`, `pen-goal`, `own-goal`, `save`, `highlight` …) and the person; e.g.
  `haw-lio-13-goal-dj.mp4`. Without teams: `clip-13-goal-dj.mp4`. Pure helper `clipFileName()` in
  `src/utils/clipName.ts`.
- Not resumable (short).

### Sting
- New outro variant: `GraphicsSpec.outro?: CardSpec | StingSpec` with `StingSpec = { kind: 'sting' }`; `CardSpec`
  keeps its shape and is told apart by `'kind' in outro`. `STING_SEC = 3.5`.
- Painter per theme (`paintSting`): Night Turf background, the Shooot wordmark (from `brand/shooot/assets`,
  rasterised like the logo), a short motion (wordmark scales/fades in over ~0.6 s, holds, fades to black over the
  last ~0.5 s) using the motion tokens' easing. Silent audio (existing card path). No team or match content.
- Classic theme uses the same sting (brand mark, not theme styling).

### Popover and job
- ⬇ opens `ClipDownloadPopover` (FloatingPanel anchored; sheet on phones): ☑ Score (hidden when teams aren't set),
  ☑ Replay (hidden when the event has no replay), primary **Download**.
- Choices persist in the store (`clipOptions: { score: boolean; replay: boolean }`, default both true): state
  version bump + migration + test; project import/transfer ignore it (device preference).
- Download starts a render through the existing render manager (`renderJobs`) with kind `clip`; progress on the
  Export button as today, auto-download once, report/diagnostics as for other renders.
- While another render is running, Download is disabled with "A render is in progress".
- A clip whose event isn't linked to a loaded file: Download disabled with "Relink the file first".

## 3. Error handling

- Graphics or sting failures follow the existing rule: render without them, list under "Rendered without".
- A clip that falls outside its file (bad time) is rejected by `buildRenderPlan`/engine as today ("Nothing to render")
  and shown as a failed render with that reason.

## 4. Testing

- Unit: `clipExport` (cuts with/without replay, cross-file clip, captions only for that event, score on/off,
  sting present, no title/full-time cards), `clipFileName`, `eventRowParts` without assists, store migration.
- Component (happy-dom): selected row expands / collapses, one open at a time, touch tap expands, action row buttons
  call the right actions, popover options (hidden Score/Replay cases), disabled states.
- Render: generated 4K HEVC (level 6.0) and 720p H.264 media in the scratchpad; render a clip with/without score and
  replay; `ffmpeg -v error -f null -` prints nothing; frames extracted and looked at (caption, replay, sting);
  QuickTime/AVFoundation decode check for the sting splice.
- Screenshots: 390×844, 844×390, 834×1194, 1280×800, 1440×900, dark and light, touch emulation on phone/tablet.

## 5. Delivery

Two branches, implemented by subagents in `.claude/worktrees/`: `feat/event-rows` (§1, no engine changes) and
`feat/clip-download` (§2, depends on the action row's Download slot — merge §1 first, or stub the button). The main
session reviews screenshots/renders and merges.
