# Known final score — design

Date: 2026-10-12 · Status: approved in conversation ("Yes, go")

## Why

Find goals suggests moments; the user reviews them. Without knowing the real result, nobody can tell when every
goal has been found. If the user enters the final score they already know (13–9), Shooot can say "3 to find" after
review lands on 11–8, and say "all goals tagged" the moment the last one is in, so the rest of the review becomes
optional. The score is optional: sometimes the result isn't known and tagging is how it's found (today's flow).

## Decisions (from the user)

- The final score is an optional field in New match (and Match setup), not a separate step.
- New match stays a simple wizard: Videos → Match → Goals. The Match step drops the league logo and graphics style
  (they stay in Match setup and Export).
- Signal the gap only where goals are found (Find goals tally, review summary) plus a quiet Export note — not on the
  scorebug or the event rail.

## 1. Data

- Store: `knownFinalScore: Score | null` (team order, `[team1, team2]`), setter `setKnownFinalScore(score | null)`.
  Named so it is never confused with `finalScore()` in `utils/score.ts` (the score from tagged goals).
- Persisted; state version bump (24, or the next free number at merge) + migration (`knownFinalScore: null` when
  missing) + test.
- Match data: included in project export/import (`utils/projectTransfer.ts` key list, `importProject`) and transfer
  links. Older projects without it import as `null`.
- `newMatch()` clears it (it belongs to one match, like `matchdayLabel`).
- Pure helper `utils/scoreGap.ts`:
  `scoreGap(tagged: Score, known: Score | null): ScoreGap | null` →
  `{ missing: Score; extra: Score; complete: boolean }` (`missing[i] = max(0, known[i] − tagged[i])`,
  `extra[i] = max(0, tagged[i] − known[i])`, `complete` when tagged equals known). `null` when `known` is null.
  Tagged comes from `finalScore(events, teams)` so own goals and pen goals count as they do everywhere else.

## 2. Entering it

- `MatchDetails` (shared by Match setup and the New match "Match" step) gains a row under the team cards:
  `Final score (if you know it)` · `<team1 name> [ ] – [ ] <team2 name>`. Two numeric inputs
  (`inputmode="numeric"`, 0–99, `aria-label="<team> final score"`), JetBrains Mono for the digits, ≥ 44 px targets on
  touch. A "Clear" text button when set.
- Saves on blur/Enter when both boxes hold whole numbers; both empty saves `null`; one empty keeps the other as
  typed and shows a plain hint "Enter both scores, or leave both empty." (nothing saved until valid).
- `MatchDetails` gets a prop to leave out the logo and graphics style; `NewMatchFlow` uses it. Match setup keeps them.

## 3. Signalling

- **Find goals tally** (`GoalsTally`): with a known score it reads
  - short: `Goals tagged: Whites 11 – 8 Colours · final 13 – 9 · 3 to find`
  - complete: `Goals tagged: Whites 13 – 9 Colours · ✓ all goals tagged`
  - over: `… · final 13 – 9 · 1 more than the final score (Whites)` (muted warning text, never red alone).
  Without a known score it is unchanged. The aria-label says the same in words.
- **All found:** when a tag/confirm makes `complete` true (it wasn't before), show a toast "All 22 goals tagged —
  the rest of the review is optional". The review card stays usable; the summary's Done is the way out. No
  auto-close.
- **Review summary** (`SuggestionSummary`): with a known score and missing goals: `3 goals not found (Whites 2,
  Colours 1).` plus `Look through the other moments, or tag them while watching.` when any suggestions are still
  pending, else just `Tag them while watching.`. Complete: `All goals tagged.` Over: the same "more than the final
  score" line as the tally.
- **Export** (`ReelSummary`): when known and tagged differ, a quiet note `Tagged 11–8, final score 13–9.` Cards,
  captions and file names keep using the tagged goals (so the full-time card always matches the clips).
- Not shown on the scorebug, the event rail or the top bar.

## 4. Out of scope (parked in ideas.md)

- Using the count to steer detection (ranking, keeping at least N top picks, stopping early).
- Per-half scores, scorers, and using the known score in graphics.

## 5. Testing

- Unit: `scoreGap` (null, short, complete, over, mixed short/over, own goal and pen goal via `finalScore`),
  migration, project transfer round trip and old project without the field, `newMatch` clears it.
- Component (happy-dom): MatchDetails score entry (both, neither, one → hint, clear), NewMatchFlow Match step without
  logo/style, GoalsTally three states + unchanged without a score, toast fires once on reaching complete,
  SuggestionSummary lines, ReelSummary note.
- Screenshots: New match Match step and Find goals tally at 390×844, 844×390, 834×1194, 1280×800, 1440×900, dark and
  light.
