# Decisions

A short log of product and technical decisions, with the reason for each. Newest first. Each entry gives the date,
who decided, the decision, why, and where the detail lives (spec or commit). When a decision changes, add a new
entry that names the one it supersedes, and mark the old one *Superseded*. Don't rewrite history.

Specs in `docs/superpowers/specs/` hold the full designs. This file is the index of *what was decided and why*.
Decisions made before 2026-10-11 are only in the specs' "Decisions" sections; they were not backfilled here.

---

## 2026-10-12

- **Optional known final score in New match and Match setup; Find goals says how many goals are left** (user). One
  optional scoreline under the team cards (not a separate step). The gap shows only where goals are found: the Find goals
  tally ("3 to find", "✓ All goals tagged", or "N more than the final score"), the review summary, a one-off "All N goals
  tagged" toast, and a quiet Export note. Graphics and file names keep the tagged score. The New match wizard drops
  league logo and graphics style (still in Match setup / Export). *Why:* knowing the real result tells the reviewer when
  every goal is found and how many are missing, without adding a third score to the editor. *Where:*
  `docs/superpowers/specs/2026-10-12-known-final-score-design.md`, branch `feat/known-final-score`.
- **The match strip's hover bubble names the symbol under the pointer** (user). Over an event icon, a marker's flag icon
  (not its hairline) or a suggestion ring, the bubble reads e.g. "Goal · 10:00 · V2" or "Detected moment · …", at the
  symbol's own time. Anywhere else it shows the time as before. Native `title` tooltips on icons were removed, so two
  popups don't show at once. Suggestion rings are called "Detected moment" (they were "Suggested moment"). *Why:*
  clarity about what each mark on the timeline is, without the bubble changing as you scrub. *Where:*
  `src/components/MatchStrip.tsx`.
- **Find goals review loop defaults to −5 s … +5 s** (user). Supersedes −5 … +4 and earlier entries below.
  *Why:* the 03-09 goal at 28:14 had a crowd reaction ~11 s late. Across 51 real goals, −5 … +4 covered 37 and
  −9 … +6 would cover 47, but the user hadn't needed more lead-in when watching highlights, so they chose the smaller
  window. The { } keys extend it by 2 s when needed. *Where:* `src/detect/detectConfig.ts` `reviewWindowSec`,
  commit e398ff3.

## 2026-10-11

### Find goals: detection
- **The ball check uses stock COCO RF-DETR-nano (sports ball), not fine-tuned** (Claude, user aware). *Why:* it ships
  licence-clean and works now. Fine-tuning comes later, once real-match recall is measured. *Where:*
  `2026-10-11-ball-check-design.md`.
- **Balls already resting in a goal are ignored** (user agreed). Look-back samples are taken at t−20 s and t−12 s, and
  a detection within ±12 px of a look-back detection doesn't count. *Why:* on the 24-09 and 29-09 matches a spare ball
  sat in a goal for minutes and tagged the wrong goal. The share of ball tags that were real goals went from 17/35 to 12/19. *Where:*
  ball-check spec, "2026-10-11 change".
- **The ball check never picks the team** (user). *Why:* the ball-in-goal → team mapping was wrong too often (resting
  balls, end swaps), and a wrong preselection is worse than none. The reviewer chooses. *Where:* ball-check spec.
- **The ball model loads when Find goals starts, with visible download progress** (user). *Why:* loading it lazily
  after the audio pass meant a deploy in between had already removed the old chunk, so stale-build recovery reloaded
  the page ("Ball check failed" and then a refresh). There was also no progress during the ~10 s download. *Where:*
  commit 9f89f5f.
- **ONNX Runtime logs at error level only** (Claude). *Why:* the constant_folding warnings the user saw in the
  console are harmless noise.
- **No incremental audio results** (user). *Why:* the audio pass takes about a minute, so it's fine to wait for it.
  *Where:* `2026-10-11-review-lanes-design.md`.
- **Advanced detection is a tick box on the start form, behind Labs** (user). *Why:* the ball check is slow (about
  10 min per hour of 4K) and experimental, so it should be an explicit choice rather than implied. *Where:* lanes spec §B.
- **The detection range comes from the Kick off / Final whistle markers** (user asked; already the case). The start
  form is always shown, pre-filled.

### Find goals: review UX
- **Lanes are "Top picks" and "Other moments", disjoint, Top picks on the left** (user). Supersedes "On target" (it
  implies a shot on target) and "All" (it overlapped Top picks). *Where:* `2026-10-11-review-actions-toasts-design.md`
  addendum 3.
- **Keep chronology: the review never jumps around on its own** (user). *Why:* being thrown halfway along to a strong
  suggestion is disorienting. Each lane is in match order, and new tags only update counts. The single exception: once
  the last top pick is decided, the review moves on to Other moments, with a toast. *Where:* toasts spec addendum 3.
- **The review opens on Top picks while any are left** (user). Supersedes "default lane All" in the lanes spec.
- **Space only plays/pauses. Only M, the Mark moment button and frame steps mark** (user). *Why:* pausing to look was
  also marking the moment. *Where:* lanes spec §A.
- **The mark control is always on the card ("Mark again" in place)** (user). *Why:* editing and re-marking was a
  needless second step.
- **Previous/Next only move. Discard (X) is one press and moves on. Confirm (Enter). Skip removed** (user). *Why:*
  moving and deciding were mixed up. *Where:* toasts spec "Decisions".
- **Toasts for confirm, discard, tag, delete and markers, one at a time, with Undo** (user). They sit top-right of the
  video on desktop and under the video on phone portrait. Undo only acts while its action is still the latest undo step
  (review finding I3: otherwise Undo would undo something else). *Where:* toasts spec.
- **The review stays open until explicitly closed, and the rail offers "Review suggestions (N left · M top picks)"**
  (user). *Why:* tagging from the editor was dropping the user out of the review. *Where:* toasts spec addendum 1.
- **Keys: [ ] previous/next suggestion, ←/→ ±5 s as in the editor, { } extend the loop by 2 s** (user). *Why:* the
  arrows mean seek everywhere else. *Where:* addenda 2 and 5.
- **No Top pick tag on the card. A lime star and a lime selected segment for Top picks** (user). This is an approved
  exception to the lime guard. *Where:* addendum 2.
- **Scorer, assist and goalkeeper on the review card, shared with the event picker** (user). The list is alphabetical,
  and the scorer stays in the assist list but disabled. *Why:* someone using Find goals to tag the whole match should be
  able to name players there too. *Where:* addendum 3.
- **Goals tally in the review panel ("Goals tagged: Whites 3 – 2 Colours")** (user). *Why:* it's useful to see how many
  goals have been found, especially when checking against a known final score. *Where:* addendum 4.
- **Suggestion rings get their own faint lane on the match strip, and only a click on the ring opens the review**
  (user). *Why:* clicking the timeline near a ring was pulling the user into the review, and suggestions were blurring
  with real goals. *Where:* addendum 5.

### Superseded
- *Superseded 2026-10-12:* review loop −5 s … +4 s (commit 0d95a82, from the user's "suggestions are a bit short — add
  another 2 s to the end"), and before that −5 … +2 (70d2970) and −3 … +2.
- *Superseded 2026-10-11:* lane names "On target" and "All"; default lane All; the ball hint text on the card; team
  preselected from the ball tag; "Not a goal" + Enter; Skip.
