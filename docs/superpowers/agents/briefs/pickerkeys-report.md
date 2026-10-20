# Report: picker keys (fix/picker-keys)

## What changed
- `src/utils/eventPicker.ts`: new `{ kind: 'back' }` input and exported `previousStep()`. Order: text -> assist / scorer / team / type (whichever applies to the type), assist -> scorer, scorer -> team, team -> type. Going back keeps what is saved on the event (no effect emitted); back to scorer/team/type clears `scorer` (and `team` for type) in picker state so the assist-disable rule follows the new pick. Backspace: team step always goes back; scorer/assist/text only when the field is empty; type step still cancels the fresh tag. Team step: `1`/`2` (up to 9) replace the letter shortcuts. Scorer/assist: `1`-`9` pick the Nth displayed (filtered) name; the disabled scorer row on Assist does nothing.
- `src/utils/roster.ts`: `teamShortcuts` removed (only the picker used it) with its test.
- `src/components/EventPicker.tsx`: window key handler intercepts digits on team/scorer/assist (preventDefault, never typed in the filter) and passes Backspace through to the reducer only when the field is empty; "‹ Back" button in the desktop header from step 2; team kbd shows 1/2; hint line per step ("1–9 pick · ⌫ back · Tab skip · Esc to finish"); touch passes `onBack` to `TagColumn`.
- Names never move: the desktop Scorer step now renders a hidden, inert, `aria-hidden` skip row (`event-picker__skip--slot`, `data-testid="skip-slot"`) so Scorer and Assist have the same height. Touch chips were already a stable grid (Skip/None always present).
- `src/components/PersonStep.tsx`: `numbered` prop shows `<kbd>1-9</kbd>` right of the first nine typed rows (touch chips: none).
- `src/components/TagColumn.tsx`: "‹ Back" (44 px tall) left of the breadcrumbs from the second question.
- `src/components/SuggestionCard.tsx` (desktop review card): small change done: digits 1-9 on its person field pick the Nth name; rows numbered. Its Esc/Backspace behaviour (clear the choice) unchanged; no Back button there (it already has Esc/Backspace to undo the choice).
- `src/utils/shortcutList.ts`: Tagging rows for team 1/2, players 1–9, Backspace back; review row for 1–9 names. Sync test green.
- CSS in `src/App.css`: `.event-picker__skip--slot`, `.event-picker__back`, `.tagcol__back`.

## Tests (red -> green)
Honest note: I wrote the reducer change and then its tests (not strictly red first); the existing team-letter tests failing after the change (27 failures) were the red signal, then updated to 1/2. New tests: reducer `back` (every transition, touch, Backspace rules) and `number keys`; component tests for numbers on team/names, greyed-but-numbered scorer, digit never typed (defaultPrevented), skip slot present/hidden on Scorer and gone on Assist, Back button (desktop and touch), Backspace edit-vs-back; SuggestionReview digit pick. Existing assertions updated for the kbd numbers (`Bob1` etc.) and `w`/`c` -> `1`/`2`; no coverage removed (only the `teamShortcuts` unit test, with the function).

## Checks
- `npm run test:run`: exit 0, 237 files, 2702 tests.
- `npx tsc -b --noEmit`: exit 0. `npm run build`: exit 0. eslint: 11 problems (baseline 11, none added). `check-contrast.mjs`: see below.

## Playwright (1440x900, Chrome, dark; same at 1280x800 and light)
Name rows `getBoundingClientRect().top` (six names, roster Amy Dan Joe Kit Sam Taylor Zed) and popover top:
- Scorer: 492.5, 522.9, 553.3, 583.6, 614, 644.4; box top 452.5
- Assist: identical, box top 452.5 -> same: true
Back flow: Backspace from Assist -> Scorer step; two more -> Team then Type list.

## Screenshots looked at (scratchpad `pickerkeys-shots/`)
desk-{1440,1280}-{dark,light}-{0type,1team,2scorer,3assist}.png: team step shows 1 / 2 kbd and "1–2 pick · ⌫ back · Esc to finish"; Scorer shows numbers 1-6 on the right and a blank gap where the reserved skip row sits; Assist: scorer row dimmed but numbered, Skip Tab row visible in the same place, names unmoved, "‹ Back" top-left. Touch 844x390 and 390x844 (dark and light): "‹ Back" (58x44 px) in the header before the breadcrumbs; tapping returns to "Who scored?". On landscape the breadcrumbs wrap to three lines (pre-existing), Back aligned to the top.

## Proposed AGENTS.md text (§7 Keyboard / Events rail)
"Tag box (desktop): team step 1/2; Scorer/Assist 1–9 pick the Nth listed name (filtered; the scorer stays listed, numbered, inert on Assist); ⌫ goes back one question when the field is empty (type step ⌫ still cancels); a visible ‹ Back sits in the header from the second question (touch: in the Tag column header, 44 px). The Scorer step reserves the Skip row's space (hidden) so names never move between Scorer and Assist. Review card: 1–9 pick names too."

## Proposed DECISIONS.md entry
2026-10-21 · user: tag box names never move; Back; teams on 1/2; players on 1–9. Why: names jumping (skip row appearing on Assist) and letter shortcuts for teams were hard to use while tagging live. Detail: this report / commit on fix/picker-keys.

## Needs a real device
Touch Back and landscape header wrap on a real phone; desktop only verified in Chrome.
