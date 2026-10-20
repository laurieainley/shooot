# Brief: Tag box — names never move, Back, number keys for teams and players (fix/picker-keys)
Worktree: /Users/foundersfactory/code/shooot/.claude/worktrees/pickerkeys. Dev port 5206. Read docs/superpowers/agents/common-rules.md and follow it (~45 min).
Report: docs/superpowers/agents/briefs/pickerkeys-report.md (commit it). Screenshots (throwaway):
/private/tmp/claude-501/-Users-foundersfactory-code-shooot/0a52fa9f-70d8-4586-bfc1-9526af30e377/scratchpad/pickerkeys-shots/.

User asked (2026-10-21), testing on desktop:
> "Assist list should not change when a goalscorer is selected - names moving is not helpful. Happening on desktop.
> Need a back button for when entering goals etc. to go to previous step. Also switch teams to 1 and 2 for shortcuts. And players should be 1 2 3 4 5 shortcuts"

Read first: AGENTS.md §7 (Keyboard, Events rail, Tagging on touch, Touch view), `src/components/EventPicker.tsx`, `src/components/PersonStep.tsx`,
`src/components/TagColumn.tsx`, `src/utils/eventPicker.ts` (+ test), `src/utils/roster.ts` (`teamShortcuts`), `src/utils/tagFlow.ts`,
`src/utils/shortcutList.ts` (+ the test that keeps it in sync), `src/components/SuggestionCard.tsx` (desktop Find goals review card: its person step).

## Diagnosed cause of "names moving" (main session, verified with screenshots at 1440×900)
The desktop tag box (`event-picker--popover`) is anchored at its bottom and grows upward. On the Scorer step there is no Skip row; on the
Assist step a "Skip  Tab" row appears (`canSkip`), so the whole box — header and names — jumps up ~37 px. The names themselves are in the same
order (scorer greyed in place). Same risk wherever a row appears/disappears between Scorer and Assist (hint text, warning).

## Build
1. **Names never move between Scorer and Assist** (desktop popover and column placements; check the touch TagColumn too). Reserve the
   skip row's space on every person step (hidden + inert when not skippable, like `.tv-notgoal--slot`), or otherwise guarantee the name rows
   keep the same screen position. Test: the name rows' layout/DOM position is identical across the two steps (a component test that the skip
   slot exists, hidden, on a non-optional scorer step; plus a Playwright measurement in the report: `getBoundingClientRect().top` of each
   name on Scorer vs Assist, equal).
2. **Back to the previous step**, desktop and touch:
   - A visible "‹ Back" button in the tag box header on every step after the first (desktop popover/column and touch `TagColumn`; on touch
     it sits with the breadcrumbs, ≥ 44 px). Not on the first step (type).
   - Key: **Backspace** goes back when the step's text field is empty (team step always; scorer/assist/text only with an empty field —
     otherwise Backspace edits text as now). Backspace on the type step keeps today's meaning (cancel the fresh tag).
   - Order: text → assist / scorer / team / type (whichever came before for that option); assist → scorer; scorer → team; team → type.
     Going back keeps what was already saved on the event until the user picks again (re-picking overwrites; picking a different type
     still applies `optionPatch` as today). Going back to the scorer clears `state.scorer` so the assist disable rule follows the new pick.
     Implement in the reducer (`pickerReducer`, e.g. `{ kind: 'back' }`), reusing `goto` logic where it fits. Unit-test every transition.
3. **Teams on 1 and 2.** In the team step, `1` / `2` choose the first / second team (desktop picker); letter shortcuts for teams go
   (`teamShortcuts` may stay for anything else that uses it — check callers; remove if unused). The kbd hint beside each team shows 1 / 2.
4. **Players on number keys.** On Scorer / Assist (desktop typed list), `1`–`9` pick the Nth name *as displayed* (after any typed filter),
   and each row shows its number as a `<kbd>` on the right. A disabled row (the scorer on Assist) keeps its number but the key does
   nothing. Digits must be intercepted (preventDefault) so they are not typed into the filter field. Names with >9 rows: rows 10+ have no
   number. Touch chips: no numbers (no keyboard).
5. **Desktop Find goals review card** (`SuggestionCard`) person step: apply 4 there too if it's a small change (its keys are handled by its
   own handler; teams are already 1/2 there). If it is not small, leave it and say so in the report.
6. Update `src/utils/shortcutList.ts` (Tagging section: team 1/2, players 1–9, Backspace back) and keep its sync test green. Update the
   picker hint line (desktop: e.g. "1–9 pick · ⌫ back · Tab skip · Esc to finish" — keep it short; only show what applies on that step).

## Constraints
- UK English, sentence case, brand tokens only, lime only on primary/goal (lime guard test). Text sizes via tokens.
- Desktop and touch must keep working: the touch Tag column's stable grid rules (AGENTS.md "Touch view") unchanged apart from Back.
- No persisted-state change.

## Verify
TDD (reducer first). Full checks per common-rules (test:run, tsc, build — the `public/default-video.mp4` missing-file error is local-only and
expected in the main checkout; in your worktree check — and `npx eslint src`, baseline 11 problems). Screenshots: desktop 1440×900 and 1280×800
(dark + light) of Team step (1/2 kbd), Scorer step (numbers), Assist step (scorer greyed, same positions, Back button); touch 844×390 and 390×844
Tag column with Back. Seed state via localStorage `vhm-state` v26 with two teams and rosters of ~6 names; generate a ≤ 30 s clip in your
scratchpad. Propose AGENTS.md / DECISIONS.md text in the report (do not edit AGENTS.md or CLAUDE.md). Do not merge or push. Stop your dev server.
