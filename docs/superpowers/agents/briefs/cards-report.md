# Cards report (feat/cards)

Status: done, green, not merged or pushed.

## What changed
- `src/graphics/themes/shooot/layout.ts` (shared by TNF):
  - **End-card minutes**: minutes column is 380 design px (was 300 squash); minutes that don't fit wrap onto more lines at full size (`wrapMinutes`: breaks between minutes, a PEN stays with its minute); rows below move down (44 px per extra line). If the block exceeds the space (y 668..968) the whole block (names + minutes, sizes) shrinks uniformly through 1, .95 .. .75 (shared by both columns); at the .75 floor it falls back to "+N MORE" (previously 5 rows max).
  - **End line**: "Made with Shooot" centre y 1024 -> `END_LINE_Y` 990 (text bottom 1004, 32 px above the TNF stripe band at 1036). Dot is `keepColour: true` on the circle op; TNF `recolour` leaves it alone, so it stays `C.rec` (REPLAY tag dot still goes orange). Classic has no end line (no scorers, no "Made with"), unchanged.
  - **Line-ups on VS card**: when either team has `roster`, both halves use a compact layout (initials 250 -> 160, team name 96 -> 80 and kit bar up, VS roundel up to y 520, heading tag unchanged), the team with a roster gets mini shirts (poly op with new `stroke` / `lineWidth`; light and multi kits outlined dark, dark kits chalk) + names (shirt voice, 44 px), left-aligned columns centred under the team. <= 6 names one column, 7-12 two balanced columns, 13+ shows 11 + "+N MORE". Neither team has a roster -> the card is identical to before (tested with `toEqual`).
- New pure helper `src/graphics/rosterLayout.ts` (+ test), shared by shooot/tnf and classic.
- `themes/shooot/paint.ts`: PolyOp stroke painted (path re-made after stripe fill).
- `themes/classic/layout.ts` + `index.ts`: compact VS layout with small kit-colour **shields** (classic's own motif, not shirts) + names; `cardLayout` now takes `measure` and index passes `measureWith(ctx)`.
- `plan.ts`: intro badges carry `roster` (upper-cased, trimmed, blanks dropped); the outro uses plain badges. `teamStyle.ts` `TeamBadge.roster?`.
- RENDER_VERSION: `vite.config.ts renderHash()` hashes every non-test file in `src/graphics` and `src/render`, so this change alters it automatically; nothing to bump.

## Tests (note: written alongside the implementation, not strictly red-first)
- New: rosterLayout.test.ts (6), shooot layout (wrap to 2 lines, PEN kept, rows pushed down, every scorer op within maxWidth, minutes clear of centre/safe area, block above end line, uniform shrink, +N MORE fallback, 2-1 stays full size, end line gap + REC dot, roster columns/halves/outlines/no-roster identical), tnf (dot stays red, REPLAY dot still orange, gap above stripes), classic (roster), plan (roster on intro only).
- Changed: the old "+5 MORE" test for 9 scorers, whose label changed because the shrink now fits more rows (now asserts `+N MORE` where N = hidden count).
- Results: `npm run test:run` 242 files / 2771 tests pass (exit 0); `npx tsc -b --noEmit` exit 0; `npm run build` exit 0; eslint 11 problems (= baseline, none added).

## Renders looked at (design-space paintCard on /bench.html, port 5211; scratch in the session scratchpad `cards/`)
- Full-time 18-11 (MATT 4 / RYAN 8 wrapped to 2 lines / JAMES / STEVE W vs ROB / LEE / SAM TAYLOR), 20-7 with 10 scorers (shrunk to .75, "+5 MORE" / "+2 MORE"), 2-1: shooot, tnf (orange/white stripe band clear of the end line, red dot). Classic has no scorers or end line (theme setting), unchanged.
- VS with rosters 5/5, 8/8, 13/13 (+2 MORE), 6 + none, multi-colour + 12, none: shooot, tnf, classic. Lists sit in their halves, off the roundel, above the bottom edge.
- Real render: `renderReel` of a generated 1280x720 12 s clip (5 s cut) with intro + outro cards in all three themes: `ffmpeg -v error -f null -` printed nothing (exit 0), duration 14.0 s; frames from the intro (2 s) and outro (11.5 s) extracted and checked (roster intro, wrapped RYAN minutes, end line, logo present). Generated media deleted.
- Not done: dark/light and touch screenshots (no editor UI changed); Export panel not touched.

## Concerns
- With a roster on only one team both halves still get the compact layout (symmetry); the other half shows empty space under its kit bar.
- Measures use real canvas metrics in the app; unit tests use `estimateTextWidth`. A very long name in a roster is limited by maxWidth (existing squash behaviour).
- Classic uses mini shields rather than shirts (no poly op in that theme).
- Names with unusual glyphs aren't in a theme's prefetched `glyphs` string (pre-existing for names generally).
- Real-device (iPad/QuickTime) check of cards not done; layout is pure canvas, low risk.

## Proposed AGENTS.md text (Domain model / Editor layout)
- **Card layout (2026-10-21):** the VS card lists each team's roster when it has one (mini kit-colour shirt + name, left-aligned columns centred under the team; <= 6 one column, 7-12 two, more "+N MORE"; `rosterLayout.ts`, `CardSpec.left/right.roster`, intro only; initials/name/kit bar shrink and move up when either team has a roster; classic uses mini shields). Full-time scorers: minutes column 380 px, minutes wrap at full size between minutes, the block shrinks uniformly to 0.75 then "+N MORE". "Made with Shooot" sits at y 990, clear of the TNF stripe band, and its dot is always `C.rec` (`keepColour`).

## Proposed DECISIONS.md entry
2026-10-21 - user (design approved), agent: end-card minutes never squash (wrap, then uniform shrink, then +N MORE); "Made with Shooot" moved up and its dot kept REC red in every theme; opening card shows line-ups. Why: 8-goal scorers were illegibly squashed, the TNF stripe crowded the end line and recoloured the REC dot, and rosters were otherwise invisible in the reel. Detail: this report, commit on feat/cards.
