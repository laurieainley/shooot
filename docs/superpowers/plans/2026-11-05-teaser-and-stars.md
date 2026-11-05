# Teaser ("Coming up") and event stars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starred events play as a "COMING UP" teaser at the top of the highlights video, before the VS card; note captions show the whole note (two lines) and the note box allows exactly that much.

**Architecture:** A pure planner (`utils/teaser.ts`) builds the teaser cuts and puts them in front of the reel cuts; every consumer (export plan, graphics plan, chapters, preview) goes through one shared `highlightsCuts()` so cut indices always agree. The engines learn one new fact, `introAfterCut` (the VS card follows the first N cuts instead of preceding them). The teaser caption reuses the existing caption layout (slab text "COMING UP", event line in the note row), so no new painter shapes.

**Tech Stack:** React 19, TypeScript strict, Zustand (persisted `vhm-state`, now v27), Vitest + happy-dom, Mediabunny/WebCodecs engines, Playwright for real renders.

**Spec:** `docs/superpowers/specs/2026-11-05-teaser-and-marks-design.md` (read it first; this plan argues from it).

## Global Constraints

- UI word is **Star** / **Starred** (never "mark" in UI copy; AGENTS.md voice rule). Data name stays `marks`.
- `EventMark = 'teaser'` only; `MatchEvent.marks?: EventMark[]`. Markers (kick off / half time / final whistle) can't be starred.
- Teaser caption: slab `COMING UP` (goal/lime tone for every event type); note row = `"<EVENT WORD> · <NAME>"` or the event word alone; a Highlight's row is its note (no "HIGHLIGHT" prefix; no note → name, else `HIGHLIGHT`). Other events' notes are never shown. No score bug, minute, assist; neutral stripe (theme's neutral colour, as for events without a team).
- Teaser clips: no slow-mo replay, no REPLAY tag; banner for the whole teaser clip with the caption fade.
- Teasers only in the highlights export (not full match, not clip download).
- Lime only via the allow-listed classes (`utils/limeUsage.test.ts`); the row ★ is muted text colour.
- Touch targets ≥ 44 px; text tokens (`text-ui-*`), contrast ≥ 4.5:1.
- Each implementer works in `.claude/worktrees/<name>` with its own dev-server port (never 5174), follows `docs/superpowers/agents/common-rules.md`, does not edit AGENTS.md / CLAUDE.md, does not merge.
- Before done: `npm run test:run`, `npx tsc -b --noEmit`, `npm run build` (a failure only on `public/default-video.mp4` is local-only), `npx eslint src` stays at 11 problems.

## Review Focus

1. A starred event whose file is unlinked/missing → left out of the teaser (like the reel), never a crash or an empty clip. (Task 3 test.)
2. A starred event near a file boundary → its teaser clip splits across the files like a reel clip, still before the VS card. (Task 3 test.)
3. Cards off (no VS card) with a teaser → teaser cuts then the reel; `introAfterCut` ignored. (Task 3 + Task 4 tests.)
4. A 4K/1080p highlights render interrupted and resumed → unit order (teaser, card, reel, outro) is the same after resume. (Task 4 real render.)
5. Preview: ▶ on a starred event's row jumps to its reel clip, not its teaser copy. (Task 5 test.)

---

### Task 1: Stars in the data and the store

**Files:**
- Modify: `src/types.ts` (MatchEvent), `src/utils/eventTypes.ts` (`sanitiseEvents`/`migrateEvent`), `src/state.ts`
- Test: `src/utils/eventTypes.test.ts`, `src/state.test.ts`, `src/utils/projectTransfer.test.ts`

**Interfaces:**
- Produces: `type EventMark = 'teaser'`; `MatchEvent.marks?: EventMark[]`; `hasMark(e: Pick<MatchEvent,'marks'>, m: EventMark): boolean` (eventTypes.ts); store `toggleMark(eventId: string, mark: EventMark): void` (undoable, ignores markers); store `highlightsTeaser: boolean` + `setHighlightsTeaser(on: boolean): void`; persist **v28**.

- [ ] **Step 1: Failing tests**
  - `sanitiseEvents` keeps `marks: ['teaser']`, drops unknown values (`['teaser','goty']` → `['teaser']`), dedupes, removes an empty list, and drops marks on markers.
  - `toggleMark('g','teaser')` adds then removes; undo restores; on a kick-off event does nothing.
  - Migration from 27: `highlightsTeaser === true`; partialize includes `highlightsTeaser`; `opts.version` is 28.
  - A transfer link / project JSON round-trip keeps `marks`.
- [ ] **Step 2:** `npx vitest run src/utils/eventTypes.test.ts src/state.test.ts src/utils/projectTransfer.test.ts` → FAIL.
- [ ] **Step 3:** Implement. `newMatch()` resets nothing new (marks live on events; the switch is a setting and stays).
- [ ] **Step 4:** Same command → PASS; full suite green.
- [ ] **Step 5:** Commit `feat(events): starred events (marks) and the highlights teaser setting`.

### Task 2: Whole notes in captions; the note box limit

**Files:**
- Create: none (constant in `src/utils/eventTypes.ts`)
- Modify: `src/utils/eventTypes.ts`, `src/graphics/plan.ts` (`eventCaptionSpec` uses `NOTE_MAX`), `src/graphics/themes/shooot/layout.ts` (`captionLayout` wraps `note`), `src/graphics/themes/classic/layout.ts` (same), the four note inputs: `src/components/EventPicker.tsx`, `TagColumn.tsx`, `EventSheet.tsx`, `EventLog.tsx`; new `src/components/NoteCounter.tsx`
- Test: `src/graphics/themes/shooot/layout.test.ts`, `classic` layout test, `src/components/NoteCounter.test.tsx`, existing input tests

**Interfaces:**
- Produces: `NOTE_MAX: number` (eventTypes.ts); `wrapNote(text: string, maxWidth: number, size: number, measure: MeasureText, maxLines = 2): string[]` in `src/graphics/layout.ts` (last line gets "…" only when the text doesn't fit); `CaptionSpec.note` may now be up to `NOTE_MAX` chars and renders on 1–2 rows (`NOTE_H` each; the box grows); `<NoteCounter value={string} />` (shows `"N / NOTE_MAX"` once `value.length >= NOTE_MAX - 20`, `aria-live="polite"`, muted `text-ui-xs`).

- [ ] **Step 1: Measure `NOTE_MAX`.** In a Playwright page with the theme fonts loaded (`graphics/fonts.ts`), measure `'W'.repeat(n)` in the shirt voice at the note size and find the largest n such that two lines fit the note width (`CAPTION_MAX_RIGHT - pad - textX`) in both themes; then check a realistic worst case ("MMMM WWWW " words). Set `NOTE_MAX` to the realistic two-line capacity, rounded down to a multiple of 10, **not above 120 and not below 80**; record the measurement in a comment. Expected ≈ 100.
- [ ] **Step 2: Failing tests**
  - `wrapNote` splits `'LAURIE WAITS PATIENTLY FOR HARRY TO DO HIS LACES (FORESHADOWING)'` into two lines at word boundaries with the estimate measurer at a width that forces it; a string longer than two lines ends its second line with `…`; a short string is one line.
  - `captionLayout` with a 64-char note has two note text ops and a ground rect `NOTE_H` taller than with a short note; no text op has `maxWidth` smaller than its measured width (nothing squeezed).
  - `eventCaptionSpec` keeps a 64-char note in full (was cut at 60).
  - Each note input has `maxLength={NOTE_MAX}`; `NoteCounter` hidden at 79 chars, shows `"80 / 100"` at 80 (with NOTE_MAX 100; use the constant in the test).
- [ ] **Step 3:** Run those tests → FAIL. **Step 4:** Implement. Chapters keep `shortNote(e.notes)` (40). **Step 5:** PASS + full suite.
- [ ] **Step 6:** Render frames (the session's `prepareSpec` + painter approach, or `/bench`) of a two-line caption in shooot, tnf and classic at 1920×1080; look at them; copy to `~/Claude Files/teaser/`.
- [ ] **Step 7:** Commit `feat(captions): whole notes on two lines; note box limited to what shows`.

### Task 3: Teaser planning, export plan and graphics

**Files:**
- Create: `src/utils/teaser.ts`, `src/utils/teaser.test.ts`
- Modify: `src/utils/exportPlans.ts` (`ExportState.highlightsTeaser`, `highlightsExport`), `src/graphics/types.ts` (`GraphicsSpec.introAfterCut?: number`), `src/graphics/plan.ts` (`buildGraphicsSpec` gains `teaserCount?: number`; new `teaserCaptionSpec`), components that build `ExportState` (`RenderHighlights.tsx`, `FullMatchExport.tsx`, `DescriptionCopy.tsx`, `ReelSummary.tsx` — pass `highlightsTeaser`)
- Test: `src/utils/teaser.test.ts`, `src/utils/exportPlans.test.ts`, `src/graphics/plan.test.ts`

**Interfaces:**
- Produces:
  - `teaserEvents(events: MatchEvent[]): MatchEvent[]` — linked, non-marker, starred `'teaser'`, whole-timeline order.
  - `highlightsCuts(a: { events: MatchEvent[]; cumulativeOffsets: number[]; durationsSec: number[]; before: number; after: number; replay?: ReplayOptions; teaser: boolean }): { cuts: Cut[]; origins: CutOrigin[]; segments: HighlightSegment[]; teaserSegments: HighlightSegment[]; teaserCount: number }` — teaser cuts = `buildRenderPlanWithOrigins(mergeOverlappingGoalSegments(teaserEvents(...), offsets, before, after), durations /* no replay */)`; reel as today; `cuts = [...teaser, ...reel]`; teaser origins `{ segment: -1, replay: false }`; reel origins unchanged (segment indices into `segments`). `teaser: false` or nothing starred → `teaserCount 0`, identical to today.
  - `buildGraphicsSpec(..., teaserCount)`: reel captions / replay tags only look at `cuts[i]` with `i >= teaserCount`; each teaser cut gets one caption overlay for its whole length (`fromCutStart`, `toCutEnd` as needed for clips split across files, one clock spanning the clip), spec from `teaserCaptionSpec(e, teams, theme)`; a merged teaser clip switches to the next starred event's caption at `next.matchTimeSec - 1` (on the cut holding it). `spec.introAfterCut = teaserCount` only when `teaserCount > 0` and `spec.intro` exists.
  - `teaserCaptionSpec(e, teams, theme): CaptionSpec` → `{ label: 'COMING UP', tone: 'goal', note: <line per Global Constraints, uppercased, ≤ NOTE_MAX>, stripe: <theme neutral> }` (no `person`, `minute`, `assist`, `bug`).
- Consumes: `NOTE_MAX` (Task 2), `hasMark` (Task 1).

- [ ] **Step 1: Failing tests** (`teaser.test.ts`, `plan.test.ts`, `exportPlans.test.ts`)
  - One starred goal at 40 s (before 10 / after 4, replay on): `cuts[0]` = `{0, 30, 44}` with no `speed`; `teaserCount 1`; reel cuts follow unchanged (replay still in the reel).
  - A starred save at 50 s next to an unstarred goal at 55 s: the teaser cut is the save's own window `{40, 54}` (not the merged reel clip `{40, 59}`).
  - Two starred events 6 s apart → one merged teaser clip; captions switch at the second event − 1 s.
  - Starred event in an unlinked file → no teaser cut. Starred event 2 s before a file end → teaser split into two cuts across files, both before the reel.
  - `teaser: false` → output deep-equals today's plan (same cuts and signature as before the change).
  - Teaser caption: goal by Dan → note `GOAL · DAN`; pen goal → `PEN GOAL · DAN`; penalty conceded by A Lo → `PENALTY CONCEDED · A LO`; highlight with note → the note alone; highlight without note or name → `HIGHLIGHT`; a goal's own note never appears; no `bug`/`minute`/`assist`.
  - No caption or replay tag from the reel lands on a teaser cut index.
  - Cards on: `spec.introAfterCut === 1`; cards off: `introAfterCut` absent.
  - Highlights plan `seconds` includes the teaser; signature changes when a star is toggled or the switch is turned off.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS + full suite.
- [ ] **Step 5:** Commit `feat(teaser): plan starred clips before the reel, COMING UP captions`.

### Task 4: Engines place the VS card after the teaser

**Files:**
- Modify: `src/render/types.ts` (`RenderGraphics.introAfterCut?: number`), `src/graphics/prepare.ts` (carry it over), `src/render/mediabunnyEngine.ts` (unit order), `src/render/transcodePlan.ts` + `src/render/transcodeEngine.ts` (unit order, parallel units), `src/utils/chapterTimes.ts` (`estimateTimeline(cuts, introSec, slackSec?, introAfterCut = 0)`), `src/utils/renderTime.ts` (`workInputOf` order only if progress weights need it)
- Test: `src/render/transcodePlan.test.ts`, `src/utils/chapterTimes.test.ts`, plus real renders

**Interfaces:**
- Produces: output order = cuts `0…k-1`, intro card, cuts `k…n-1`, outro, where `k = introAfterCut ?? 0`. Mediabunny journal units: replace the fixed "0 = title card, 1…n = cuts" mapping with one ordered unit list used for writing, `unitsDone`, resume and `muxUnits`; the transcode `units` array is built in the same order (segments with `cutIndex < k` first). `onTimeline` timings stay indexed by cut. `estimateTimeline` inserts `introSec` before cut `k`.
- Consumes: `GraphicsSpec.introAfterCut` (Task 3).

- [ ] **Step 1: Failing tests**: `estimateTimeline` with `introAfterCut 1` puts cut 0 at 0 and cut 1 after cut 0 + intro; the transcode unit planner (pure part) with `introAfterCut 1` orders `[segment(cut0)…, intro, segment(cut1)…, outro]`; `introAfterCut` absent → today's order exactly.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. Unit-cache keys stay per unit; check `unitCache` reuse still matches by key, not position. **Step 4:** PASS + full suite.
- [ ] **Step 5: Real renders** (generated 1080p HEVC 1 s GOP + AAC, ≤ 30 s, scratchpad; Playwright on the worktree's port) of a plan with one teaser + VS card + reel + full-time card, at Original and 1080p: `ffmpeg -v error -i out.mp4 -f null -` prints nothing; AVFoundation decode to the end with no gap > 0.1 s (Swift `AVAssetReader` checker as in this session); extract frames at teaser start, teaser→card, card→reel, and look; for 1080p, interrupt after the first unit and resume, and confirm the same order. Delete media > 5 MB.
- [ ] **Step 6:** Commit `feat(render): the title card can follow the teaser cuts`.

### Task 5: Chapters and preview

**Files:**
- Modify: `src/utils/descriptions.ts` (`highlightsDescription` uses `highlightsCuts`), `src/utils/chapters.ts` (`highlightChapterLines` gains `teaser?: boolean`), `src/components/DescriptionCopy.tsx` (pass the setting), `src/utils/preview.ts` (`buildPreviewPlan` gains `teaserSegments`), `src/state.ts` (`startPreview` uses `highlightsCuts`' segments)
- Test: `src/utils/descriptions.test.ts`, `src/utils/chapters.test.ts`, `src/utils/preview.test.ts`, `src/state.test.ts`

**Interfaces:**
- Consumes: `highlightsCuts` (Task 3), `estimateTimeline(..., introAfterCut)` (Task 4).
- Produces: with a teaser, chapters start `00:00 Coming up`, and the first event chapter is at its real/estimated start (after teaser + intro), not forced to 00:00; `PreviewStep.teaser?: true` on teaser steps (played first, no replay); `previewStepForEvent` skips `teaser` steps.

- [ ] **Step 1: Failing tests**: description with one starred goal and cards on: line 1 of chapters `00:00 Coming up`, next chapter at `teaserLen + INTRO_SEC` (estimate, re-encoded = no slack); no teaser → today's output byte-for-byte; preview steps start with the teaser step (`teaser: true`, `speed 1`), `previewStepForEvent(steps, starredId)` returns its reel step.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + full suite.
- [ ] **Step 5:** Commit `feat(teaser): Coming up chapter and preview`.

### Task 6: ★ Star in the Events list and the Export row

**Files:**
- Create: `src/components/StarMenu.tsx` (+ test)
- Modify: `src/components/EventActions.tsx` (★ Star between Framing and the download slot), `src/components/EventLog.tsx` (row ★ after the name; `S` on a focused row opens the menu), `src/utils/shortcutList.ts`, `src/components/ClipSettings.tsx` (Teaser row + switch), the "Clips & replays" disclosure summary, `src/components/ReelSummary.tsx` (length includes the teaser), `src/App.css`
- Test: `src/components/EventActions.test.tsx`, `EventLog.test.tsx`, `StarMenu.test.tsx`, `ClipSettings.test.tsx`, `src/utils/shortcutList.test.ts`

**Interfaces:**
- Consumes: `toggleMark`, `hasMark`, `highlightsTeaser`/`setHighlightsTeaser` (Task 1); `teaserEvents` + plan seconds (Task 3).
- Produces: button `aria-label="Star"`, label "Star" (icon-only ≤ 360 px rails), `aria-haspopup="menu"`; menu item `role="menuitemcheckbox"` "Teaser (top of video)", stays open on toggle, Esc closes and returns focus; row ★ `aria-label="Starred: teaser"`; Export row: "Teaser" + switch (`role="switch"`, aria-label "Teaser") + summary `"2 moments · 28 s"`; none starred → `"None starred: use ★ Star on an event"` and no switch; disclosure summary adds `· teaser 28 s` when on.

- [ ] **Step 1: Failing tests** for each Produces line, plus: markers have no Star button; toggling via the menu shows/hides the row ★; switching the Export row off keeps the stars.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (reuse the existing popover pattern used by `ClipDownload`). **Step 4:** PASS + full suite; `node scripts/check-contrast.mjs` exit 0.
- [ ] **Step 5: Screenshots** at 390×844, 844×390, 834×1194, 1280×800, 1440×900, dark and light (touch emulation for phone/tablet) of: a selected row with the menu open, a starred row, the Export row (on / none). Check rail widths 361–440 px wrap and 360 px icon-only. Copy to `~/Claude Files/teaser/`.
- [ ] **Step 6:** Commit `feat(teaser): Star menu on events and the Export teaser row`.

### Task 7: Docs (main session)

- [ ] AGENTS.md: domain model (stars/marks, teaser order, `introAfterCut`, notes `NOTE_MAX` + two-line captions, persist v28), Events rail (★ Star), Export (Teaser row), keyboard (S on a row).
- [ ] DECISIONS.md entry 2026-11-05 (the user's choices: option B, "Star", COMING UP replaces the event word, no notes except highlights, no slow-mo; agent calls listed in the spec).
- [ ] Commit `docs: teaser and stars`.
