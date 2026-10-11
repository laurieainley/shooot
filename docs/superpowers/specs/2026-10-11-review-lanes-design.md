# Find goals review: one-step marking, Advanced detection, Top picks — design

Date: 2026-10-11 · Status: approved in chat (user) · Builds on `2026-10-11-suggested-goals-design.md` and
`2026-10-11-ball-check-design.md`.

## Why
- Space while reviewing both paused and marked the moment. The user wants Space to only play/pause.
- Re-marking needs two steps (tap the time chip, then mark again). The mark control should always be on the card.
- The ball check's result is only a text hint. The user wants suggestions visibly sorted into "Top picks" (ball seen
  in a goal) and the rest, without losing match order and without the panel jumping around.
- The goal-mouth check should be chosen explicitly before a run ("Advanced detection"), not implied by Labs.

## Decisions (user, 2026-10-11)
- Names: **Top picks** (ball seen in a goal mouth) and **All**. Not "On target" (implies a shot on target).
- Keep chronology. The panel never switches lane or jumps to another suggestion by itself; tags arriving during
  review must be *visible* (live count), not reorder anything.
- No incremental audio results: the audio pass takes about a minute, so wait for it.
- Advanced detection stays behind Labs for now (the tick box only shows with Labs on).

## A. Marking (SuggestionCard, useMarkedMoment)
1. Space only plays/pauses. Pausing never marks.
2. The moment is marked by: **M**, the **Mark moment** button, or stepping a frame (↑/↓ keys, ◀ ▶ frame buttons).
   While paused after a mark, stepping moves the mark (as now). Playing again keeps the last mark (as now).
3. The mark control is always shown on the card (no edit-chip-then-remark):
   - not marked: `● Mark moment  M` + "Use the estimate instead" link;
   - marked: the marked time + "marked", and the same button reads `Mark again  M` in place;
   - estimate accepted: the estimate time + "estimate", button `Mark moment  M`.
   The type and team steps show below once the moment is settled (marked or estimate accepted) and do not hide it.
   The "what it was" chip with ✎ (clear choice) stays.
4. Instruction line: "Pause when the ball crosses the line, then press M (or tap Mark moment)" stays valid.

## B. Advanced detection (start form)
1. Find goals always shows the start form before a new run (today it only shows when Kick off / Final whistle are
   missing): the match start/end step as now (pre-filled when both are tagged, so it's just a confirm), plus — with
   Labs on — a tick box:
   **Advanced detection** — "Also look for the ball in the goal mouths. Slower: about 10 minutes for an hour of 4K."
   - Enabled and ticked by default when at least one goal is marked.
   - No goals marked: disabled and unticked, with "Mark the goals in Match setup first." and an "Open Match setup" button.
   - "Skip — use the whole video" keeps the tick box's value.
2. `startDetection({ wholeVideo?, ball? })`: phase 2 and the early detector load run only when `ball` is true
   (and Labs on and a goal is marked, as now). The choice is not persisted.
3. "Try again" / "Clear and find goals" go through the same form.
4. The separate "Mark the goals in Match setup to also check the goal mouths" hint after a run is removed (the form
   covers it).

## C. Top picks lane (SuggestionReview)
1. When the run used Advanced detection (ball phase running, done, or any suggestion has `ball`), the panel shows a
   two-option switch at the top: **All (35)** · **Top picks (7)**. Without Advanced detection: no switch (as today).
2. Default lane: All. Both lanes are in match order (suggestions are kept sorted by time). The lane is UI-only state,
   not persisted; each lane remembers its own position. Switching to Top picks opens the first top pick still to
   review (or the first top pick if all are decided); switching back to All returns to where you were in All.
3. Header count is per lane: "Suggestion 3 of 7" in Top picks.
4. Prev / Next / Skip / Save-then-next move within the current lane only. Decisions are shared (a suggestion decided
   in one lane shows as decided in the other).
5. Live sorting while the ball check runs: the Top picks count updates as tags arrive, with a brief "+1" next to it
   (no animation under `prefers-reduced-motion`), and the progress line reads
   "Checking the goal mouths… 40% · 3 top picks so far". The current card never changes because of a new tag.
6. Card badge for a top pick: **Top pick** tag + "Ball seen in a goal mouth" (replaces the plain hint). Not lime
   (lime = goal / primary action); neutral chalk tag, contrast ≥ 4.5:1. Goal stays pre-selected for top picks; the
   team is left to the user.
7. Empty Top picks after the ball check finished: "No top picks — the ball wasn't seen in a goal for any suggestion."
8. Summary adds the Top picks count (existing "Ball seen in N." becomes "Top picks: N.").

## Out of scope
- Incremental (streaming) audio suggestions; starting the ball check before the audio pass ends.
- Showing Advanced detection without Labs.
- Different strip ring styling for top picks.

## Testing
- Component tests (happy-dom): Space toggles playback without marking; M / Mark moment / frame step mark; mark
  control visible after marking and re-marks in place; start form always shown, tick box default/disabled states and
  its effect on `startDetection`; lane switch counts, per-lane navigation and positions, live count + "+1" when a
  tag arrives without changing the current card, empty Top picks copy, summary copy.
- Store/job tests: `startDetection({ ball: false })` creates no detector and runs no phase 2.
- Screenshots of the review panel (All and Top picks lanes, start form with and without goal marks) at the standard
  sizes, dark and light.
