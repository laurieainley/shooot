# Brief: Tagged score above the known final score — reminder + "Update to N–M" (feat/score-over)
Worktree: /Users/foundersfactory/code/shooot/.claude/worktrees/scoreover. Dev port 5208. Read docs/superpowers/agents/common-rules.md and follow it (~40 min).
Report: docs/superpowers/agents/briefs/scoreover-report.md (commit it). Screenshots (throwaway):
/private/tmp/claude-501/-Users-foundersfactory-code-shooot/0a52fa9f-70d8-4586-bfc1-9526af30e377/scratchpad/scoreover-shots/.
Another agent is changing the tag box (EventPicker.tsx, PersonStep.tsx, TagColumn.tsx, utils/eventPicker.ts, utils/shortcutList.ts) in parallel —
do not edit those files.

User asked (2026-10-21):
> "If logged score is higher than the score registered, a reminder should appear to inform the user the final score may need to be updated
> + inline link to update to current registered score"

Read first: AGENTS.md §4 "Known final score", §7 Toasts; `src/utils/scoreGap.ts` (+ test), `src/components/useAllGoalsToast.ts`, `GoalsTally.tsx`,
`SuggestionSummary.tsx`, `ReelSummary.tsx`, `MatchDetails.tsx` (score box), `src/toasts.ts` (`showToast(text, action?, secondary?)`), `utils/score.ts`
(`finalScore`), state `knownFinalScore` / its setter.

## Decisions (main session)
- "Over" = either team's tagged goals exceed the known final score (`scoreGap(...).extra` has a count > 0). Only when a final score is known.
- **The update target** is per team the larger of known and tagged: known 13–9, tagged 14–9 → 14–9; known 13–9, tagged 14–7 → 14–9 (Colours'
  9 stays, so goals still to find are not lost). Pure helper in scoreGap.ts, e.g. `raisedScore(tagged, known): Score`, unit-tested. The link
  text always shows the exact result: "Update to 14–9" (en dash, team order as everywhere else). Undoable like other score edits if the store
  supports undo for it; otherwise say so in the report.

## Build
1. **Reminder when it happens** (desktop and touch, any way of tagging — not only inside Find goals): when the tagged score goes from not-over to
   over (never on load/mount, never repeatedly for the same state; again if it goes back under and over later), show a toast:
   "That's more than the final score (13–9) — it may need updating." with action **Update to 14–9**. If a tag toast has just appeared
   (same pattern as `useAllGoalsToast` SAME_ACTION_MS), join it instead of replacing it: keep its text + " · more than the final score (13–9)",
   keep its Undo as the primary action and use the secondary action for "Update to 14–9" (it replaces "Add note" in that case). Mount the hook
   once where it is always alive in the editor (not only in SuggestionReview/TagControls); make sure the existing all-goals toast and this one
   can't double-fire from two mounts.
2. **Inline, wherever the over state is already shown** (`extraText` "1 more than the final score (Whites)"): GoalsTally, SuggestionSummary,
   ReelSummary (Export) and under the score in MatchDetails (Match setup / New match Match step) — add a quiet inline text button
   "Update to 14–9" right after the line. MatchDetails gets a short line too if it doesn't show one yet ("Tagged 14–9 is more than this.
   Update to 14–9"). Quiet link style (not lime; brand tokens; ≥ 44 px target on touch via padding; contrast ≥ 4.5:1).
3. Clicking either sets `knownFinalScore` to the raised score; the reminders disappear because the gap is now complete or not over.

## Constraints
UK English, sentence case, plain wording (no brand voice in a warning). No persisted-shape change (knownFinalScore already exists). Lime guard test.

## Verify
TDD: `raisedScore`, the transition hook (fires once on not-over→over; not on mount; joins a fresh tag toast; secondary action updates), each
inline link renders only when over and updates the score. Full checks per common-rules (test:run, tsc, build, `npx eslint src` baseline 11).
Screenshots: desktop 1440×900 Export drawer + Match setup + the toast after tagging; touch 390×844 and 844×390 toast; dark + light. Seed
`vhm-state` v26 with teams, a knownFinalScore and goals so one more tag goes over; generate a ≤ 30 s clip in your scratchpad.
Propose AGENTS.md / DECISIONS.md text in the report (do not edit AGENTS.md or CLAUDE.md). Do not merge or push. Stop your dev server.
