# Coming up section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starred moments get their own editable entries (caption, seconds before/after, slow-mo replay, replay framing) in a Coming up section at the top of the Events list; the edits change only the teaser.

**Architecture:** Per-event overrides live on the event (`MatchEvent.teaser`), are cleaned by `sanitiseEvents` and dropped on unstar. `highlightsCuts()` builds one teaser clip per starred event from its overrides (never merged), optionally followed by a teaser replay; graphics read the caption override. The UI adds a section to `EventLog`, a `TeaserSheet`, and a framing target for `ReplayFraming`.

**Tech Stack:** React 19, TS strict, Zustand (`vhm-state` v28), Vitest + happy-dom, Playwright, Mediabunny/WebCodecs engines.

**Spec:** `docs/superpowers/specs/2026-11-05-coming-up-section-design.md` (read first). Background: `docs/superpowers/specs/2026-11-05-teaser-and-marks-design.md` and AGENTS.md "Teaser and stars".

## Global Constraints

- `TeaserEdit = { caption?: string; beforeSec?: number; afterSec?: number; replay?: boolean; replayCrop?: ReplayCrop }` on `MatchEvent.teaser`; absent fields = defaults (automatic caption, match `lengthBeforeGoalSec`/`lengthAfterGoalSec`, replay off, the event's own framing).
- Kept only while the event is starred `'teaser'`; caption trimmed to `2 * NOTE_MAX`; seconds clamped 0–15; unstar and `placeMarker` delete it (unstar in the same undo step).
- Nothing set on a teaser entry changes the reel, the full match or a clip download (reel cuts/spec deep-equal with and without edits).
- Each teaser moment is its own clip (never merged with another teaser moment).
- Teaser replay: match replay window/speed/gain; framing `teaser.replayCrop ?? event.replayCrop ?? automatic`; REPLAY tag over it; the COMING UP banner covers only the normal-speed clip.
- UI words: "Coming up", "Unstar", "Teaser"; never "mark". Lime only via the allow-list; tokens; 44 px touch targets; 14 px touch text; contrast ≥ 4.5:1.
- Implementers: own worktree under `.claude/worktrees/`, own port (never 5174), `docs/superpowers/agents/common-rules.md`, never stage `.superpowers/`, no bare `git stash`, don't edit AGENTS.md/CLAUDE.md/DECISIONS.md, don't merge.

## Review Focus

1. A teaser edit on an event that is later unstarred and re-starred → starts fresh (no stale caption). (Task 1 test.)
2. Two starred moments 3 s apart with default seconds → two separate teaser clips with overlapping footage, each with its own banner. (Task 2 test.)
3. Teaser replay on + reel replay off for the same goal → replay only in the teaser. (Task 2 test.)
4. Framing set on the teaser → reel replay framing unchanged, and vice versa. (Task 3 test.)
5. Starred moment in an unloaded file → its Coming up row still shows (so it can be unstarred/edited) but the teaser skips it. (Task 3 test.)

---

### Task 1: Teaser edits in the data and the store

**Files:** Modify `src/types.ts`, `src/utils/eventTypes.ts` (`cleanMarks`/`migrateEvent`), `src/state.ts` (`toggleMark`, `placeMarker`, new `setTeaserEdit`). Tests next to them; project/transfer round-trip in `src/utils/projectTransfer.test.ts` and `src/components/applyProject.test.ts`.

**Interfaces — Produces:** `type TeaserEdit`; `MatchEvent.teaser?: TeaserEdit`; `setTeaserEdit(eventId: string, patch: Partial<TeaserEdit>): void` (undoable; `caption: ''` or whitespace unsets caption; `undefined` values unset keys; no-op unless the event is starred).

- [ ] **Step 1: Failing tests:** sanitise keeps `teaser` on a starred event; drops it on an unstarred event and on markers; trims a 250-char caption to 200; clamps `beforeSec: 40` → 15 and `-2` → 0; drops unknown keys. `toggleMark` unstar removes `teaser` and one undo restores both the star and the edits; re-star starts with no `teaser`. `setTeaserEdit` sets/unsets fields and is undoable; ignored for unstarred events. Project JSON and transfer link keep `teaser`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** PASS + full suite, tsc, eslint (baseline 11).
- [ ] **Step 5:** commit `feat(teaser): per-moment teaser edits in the data`.

### Task 2: Planning and graphics use the edits

**Files:** Modify `src/utils/teaser.ts` (`highlightsCuts`, `teaserLength`), `src/graphics/plan.ts` (`teaserCaptionSpec`, teaser caption grouping), `src/utils/attack.ts` only if the crop resolver needs a teaser crop parameter. Tests: `teaser.test.ts`, `plan.test.ts`, `exportPlans.test.ts`, `descriptions.test.ts`, `preview.test.ts`.

**Interfaces — Consumes:** Task 1 `TeaserEdit`. **Produces:** `highlightsCuts` teaser part = per starred event (match order) its window `[t − (teaser.beforeSec ?? before), t + (teaser.afterSec ?? after)]` via `buildRenderPlanWithOrigins([oneSegment], durations, teaser.replay ? replayOptionsWithCrop : undefined)`, one segment per event (no merging); `teaserClips[i]` = that event's teaser index for the normal-speed cuts, and replay cuts are marked so captions skip them (e.g. `teaserReplay: boolean[]` alongside, or origins `replay: true`); `teaserCaptionSpec` uses `teaser.caption` (uppercased) when set.

- [ ] **Step 1: Failing tests:** overrides change only the teaser cuts (reel cuts + reel overlays deep-equal to no edits); two starred moments 3 s apart → two teaser clips; teaser replay on → slowed cut after its clip with the match's speed and gain, REPLAY tag on it, no COMING UP caption on it; `teaser.replayCrop` used for the teaser replay while the reel replay keeps `event.replayCrop`; caption override text appears (uppercased, wrapped); `teaserLength` seconds include the teaser replay; chapters (`highlightsDescription`) and preview steps still line up (teaser replay step `teaser: true` at the replay speed); plan signature changes with each override.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS + full suite.
- [ ] **Step 5: Real renders** (generated 1080p HEVC 1 s GOP + AAC ≤ 30 s; Original and 1080p) with one teaser moment having a caption override, custom seconds and a cropped teaser replay: `ffmpeg -v error … -f null -` silent; `swiftc -O scripts/avcheck.swift` check clean (no gap > 0.1 s); frames at teaser clip / teaser replay / VS card / reel looked at; copy to `~/Claude Files/teaser/t8-*.png`. Delete media > 5 MB.
- [ ] **Step 6:** commit `feat(teaser): teaser clips follow each moment's own edits`.

### Task 3: The Coming up section, sheet and framing

**Files:** Create `src/components/TeaserSection.tsx` (+ test), `src/components/TeaserSheet.tsx` (+ test). Modify `src/components/EventLog.tsx` (section + one keyboard list across both), `src/components/ReplayFraming.tsx` (target `'event' | 'teaser'`), `src/state.ts` (open the sheet / framing for a teaser: e.g. `editTeaser(id, view: 'details' | 'framing')` with its own panel or `editingTarget`), `src/utils/shortcutList.ts` if keys change, `src/App.css`.

**Interfaces — Consumes:** Tasks 1–2 (`setTeaserEdit`, `teaserCaptionSpec` line for the row text — export a pure `teaserLine(e, theme?)` from plan.ts if needed). **Produces:** section header `★ COMING UP` + `N moments · S s` (from `teaserLength`); one row per starred event (including unloaded ones, flagged like other missing-file rows) showing the line as it will read; selected row actions: Replay switch (teaser's, `aria-label="Teaser slow-mo replay"`) · Edit · Framing (disabled while teaser replay off) · ★ Unstar; a "Match" heading over the usual list when the section shows; `TeaserSheet` titled "Teaser: <label> · <clock>" with Caption (`maxLength={NOTE_MAX}` + `NoteCounter`, placeholder = automatic line), Seconds before / after (placeholders = match values, 0–15), Slow-mo replay switch, "Reset to automatic"; ▶ on a teaser row seeks to its teaser clip start; ↑/↓ across both sections; R/E/Enter/Delete (= Unstar) on teaser rows.

- [ ] **Step 1: Failing tests** for each Produces line; Framing on a teaser row writes `teaser.replayCrop` only; Reset clears `teaser`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS + full suite, tsc, build, eslint, contrast.
- [ ] **Step 5: Screenshots** 390×844, 844×390, 834×1194, 1280×800, 1440×900, dark + light, touch for phone/tablet: section with two moments, a selected teaser row, the sheet, framing on a teaser. Look at each; copy to `~/Claude Files/teaser/t9-*.png`.
- [ ] **Step 6:** commit `feat(teaser): Coming up section with editable teaser moments`.

### Task 4: Docs (main session)

- [ ] AGENTS.md "Teaser and stars" entry: the section, `MatchEvent.teaser`, per-moment clips, teaser replay. DECISIONS.md entry. Commit `docs: Coming up section`.
