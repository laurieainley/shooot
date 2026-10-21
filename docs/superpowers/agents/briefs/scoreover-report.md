# Report: score over the known final score (feat/score-over)

Status: done, green, not merged.

## What changed
- `utils/scoreGap.ts`: `raisedScore(tagged, known)` (per-team max) and `isOver(gap)`; tests added.
- `components/useFinalScoreToasts.ts` (replaces `useAllGoalsToast.ts`), mounted once in `App.tsx`; removed from `TagControls` and `SuggestionReview` (no double fire). Handles both the all-goals note and the new over-the-score reminder.
  - Over: fires only on not-over -> over (not on mount, not repeatedly, again after under -> over). Text "That's more than the final score (2–1) — it may need updating." with action "Update to 3–1".
  - Joins a tag toast: if one is fresh (< 500 ms) it becomes "<tag text> · more than the final score (2–1)", Undo stays primary, "Update to 3–1" takes the secondary slot (replaces Add note). Also, because the tag box commits the goal first and shows its toast only when it closes (seconds later), the reminder toast, while still on screen, is folded into the tag toast that replaces it (found in the browser; unit-tested).
- `components/raiseFinalScore.ts`: sets `knownFinalScore` to the raised score and shows "Final score updated to 3–1" with Undo (restores the old score). Score edits are not on the store's undo stack (events only), so the Undo is this toast action.
- `components/UpdateScoreLink.tsx`: quiet underlined inline button "Update to 3–1" (only when over). Used in GoalsTally, SuggestionSummary, ReelSummary and a new line under the score in MatchDetails ("Tagged 3–1 is more than this. Update to 3–1"). CSS `.update-score` at end of App.css (text colour token, no lime; 44 px target and 14 px on `pointer: coarse`).
- GoalsTally: the link sits outside the aria-hidden part, so the group label now ends "... Update to 14–9" (test updated).
- SuggestionReview tests wrap the review with the hook (it moved to App).

## Tests (red -> green)
Honest note: I wrote the implementation and the tests close together rather than strictly red-first. New tests: scoreGap (raisedScore, isOver), useFinalScoreToasts (no fire on mount, once, again after under/over, joins fresh tag toast, folds into later tag toast, all-goals still works, no known score), UpdateScoreLink, and one link test each in GoalsTally, ReelSummary, SuggestionSummary, MatchDetails.

## Checks
- test:run exit 0, 238 files, 2698 tests. tsc exit 0. build exit 0. eslint 11 problems (baseline, none added). check-contrast: all pairs >= 4.5:1.

## Screenshots looked at (scratchpad scoreover-shots/)
- Desktop 1440x900 dark + light: toast over the video with "Update to 3–1" link; Export drawer line "Tagged 3–1, final score 2–1. Update to 3–1"; Match setup line under the score box; after click the link disappears. Legible, no lime.
- Touch 390x844 and 844x390, dark + light: joined toast "Goal · Whites tagged at 00:00 · more than the final score (2–1)  Undo  Update to 3–1". Readable and wraps cleanly.
- Not separately screenshotted: GoalsTally and SuggestionSummary inline links (unit-tested only).

## Proposed AGENTS.md text (Known final score bullet, append)
"When a team's tagged goals exceed the known final score (`isOver`), a one-off toast says so with **Update to N–M** (`useFinalScoreToasts`, mounted once in App.tsx; joins a fresh/replacing tag toast: Undo stays, Update takes the secondary slot), and the same inline `UpdateScoreLink` follows the over line in GoalsTally, SuggestionSummary, ReelSummary and under the score in MatchDetails. The target is `raisedScore()` (per team the larger of known and tagged); the update shows a 'Final score updated' toast whose Undo restores the old score."

## Proposed DECISIONS.md entry
2026-10-21, user (request) + agent: Tagged goals over the known final score show a reminder toast and inline "Update to N–M" links (per-team max, so goals still to find are kept). Why: the known score is the user's typed number; a higher tag count usually means it is stale. Detail: this report, commit messages on feat/score-over.

## Concerns
- Real device not tested (touch checked only in Playwright emulation).
- In the dev flow, pressing Esc at the scorer step after choosing a team showed a "Goal tagged" toast without the score changing in my test; I did not investigate (EventPicker is another agent's file).
- Screenshots/media: the clip was reused from an earlier scratchpad (1 MB); dev server stopped.
