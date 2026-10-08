# Calm Editor — Layout & Visual Cleanup (Sub-project Y)

**Date:** 2026-10-09
**Source:** user review: "interface is a bit of a mess… events above the video scrubber and below in the timeline… flooded with neon… can't distinguish the export overlay… do clip/replay/reel settings need to be visible?… menu ⋯ misaligned next to Match and Export, different fonts… Match not a clear word for Setup… do we need HEVC and full filenames in the top bar?… go back to football icons for goals, gloves for saves rather than the lines."
**Decisions (user):** events stay in a right-hand column on desktop; keyboard hint bar hidden behind "?".
**Builds on:** branch `fix/rows-scorebug` (commit 8a829ca): `Scorebug` overlay + `scorebugModel`, ScoreBadge removed from top bar, event row content/slot layout + `eventRowParts`.

## Principles
- **Lime means two things only:** the single primary action in view (Export in the top bar; Render inside the export panel) and goals (goal icon / goal ticks / scorebug score). Everything else is chalk/muted/surface: checkboxes, radio/theme chips, replay ↻ toggles (on = chalk filled icon on surface-2, off = muted outline), selected file, tab underlines, focus rings (chalk), links. Red (`--sh-rec`) only for the playhead and "rendering" indicators.
- **One timeline:** the match strip is the only scrubber and the only place events are drawn on a timeline. Remove event markers from the video.js progress bar and remove the video.js progress bar itself (control bar keeps play/pause, current/total time, volume/mute, speed, fullscreen). The match strip must therefore be a complete scrubber: click/drag seek (exists), playhead (red), current time readout, hover time bubble on desktop, keyboard focusable with ←/→.
- **Show what the editor needs while tagging; settings live where they're used.**

## Top bar (desktop)
`[wordmark]  [Files: "4 files · 56:34 ▾"]                        [Setup] [Export] [⋯]`
- Files: one compact button (count + total duration; warning dot if any file needs attention: can't play / missing full file / proxy only). Opens the existing Files sheet (order numbers, names, durations, HEVC/proxy badges, reorder, remove, add). No file pills in the bar. `[ ]` still switch files; the strip shows file boundaries + names.
- "Match" → **"Setup"** (aria "Match setup"). Setup, Export, ⋯ are one component family: same height (40px desktop / 44px touch), same font (Archivo 700, 14px, sentence case), aligned on one baseline; Setup and ⋯ are quiet (surface-2 / outline), Export is the only lime button. While rendering, Export shows a small red dot + percentage instead of the separate "Polishing… 4%" chip (one place).
- Score is not in the top bar (it's the on-video Scorebug).
- Phone: wordmark, Files button (icon + count), Export, ⋯ (Setup inside ⋯ on phone if space requires).

## Video area
- Scorebug overlay top-left (from fix/rows-scorebug), zoom chip bottom-left, fullscreen/expand control top-right only on touch.
- video.js control bar: no progress bar; compact; muted chalk icons.

## Match strip (the timeline)
- Event icons instead of tick lines (see Icons), sized 14–16px desktop / 18px touch, centred on their time; overlapping icons stack slightly offset (no hidden events); kick off / half time / final whistle as small flags at the top edge. Clip spans as faint surface bands (not lime). Playhead red line + dot. File boundaries thin lines with file numbers ("1", "2"…) and names on hover.
- Current time readout at the left (existing), file x/y under it.

## Events column (desktop right rail)
- Header: "Events · 28" + "+ Tag event" (quiet button with red REC dot; not lime) + undo/redo.
- Rows: `clock | team dot | icon | name (shirt font) [line 2: Assist: Joe · note] | score (goals only) | file no. (multi-file only) | ▶ | ↻ | ⌖ | ×` — fixed slots (from fix/rows-scorebug), icon replaces the text tag, freeing ~60px for names. Names never clipped. Selected row: surface-2 background + 2px chalk left edge (not lime).
- **Footer removed** (Clip / Replay / Reel): reel length + clip count move into the Export panel.
- Phone/tablet: same row content, list under the video, FAB "+" with REC dot.

## Icons (one SVG set, `src/components/icons/`)
- Goal: football (lime fill on dark, lime-text on light); Pen goal: football + small "P"; Own goal: football in chalk with "OG" mini-label; Penalty missed: penalty spot with ✕; Penalty conceded: penalty spot; Save: goalkeeper glove; Foul: whistle; Highlight: star; Kick off: flag; Half time: pause bars in a circle; Final whistle: chequered flag. Line-art 1.75px stroke, 24×24 grid, currentColor except the goal's lime. Accessible names on every use (aria-label/title). Used in strip, rows, picker type list, edit sheet type chips, export summaries.

## Export panel
- Opens as an **elevated panel with a scrim**: desktop = right-side drawer (420px) over a 40% black scrim on the rest of the app, surface colour one step lighter than the rail, shadow, its own header "Export" + close; Esc/scrim click closes (render keeps running). Phone = full-height sheet.
- Sections (highlights tab): **Reel** (length + clip count, "Clips: 10 s before / 4 s after · Replays: 3 s → 1 s at 0.5×" summary with an "Edit" disclosure that reveals the clip padding + replay settings inline), **Graphics** (look chips + checkboxes, all neutral styling), **Render** (one lime button; progress + Cancel inside the panel; device-specific keep-open notice; Copy diagnostics), **Share** (YouTube description, goalscorers). Full match tab: same structure.
- Render progress shows here and on the Export button (red dot + %); no separate chip in the top bar.

## Keyboard hints
- Remove the always-on hints bar. Add a small "?" button (bottom-right of the rail or in ⋯) and the `?` key to open a Shortcuts sheet listing all shortcuts (grouped: Playback, Tagging, Navigation, Zoom, Editing). Picker keycaps stay in the picker.

## ⋯ menu
- Fix horizontal overflow (suspects from 8a829ca report: close button negative margin in `.floating__head`, `.floating` overflow:auto, `.menu-list > button` width 100% without border-box). Quiet close ✕ (shared CloseButton, chalk icon, no lime outline). Items: New match…, Files, Setup (phone), Advanced settings, Paste list, Send project to another device, Export project, Import project, Shortcuts.

## Testing
- Unit: event icon mapping (every type has an icon + label), files summary (count/duration/attention), strip icon stacking (no overlap loss), lime-usage guard (a test that scans App.css for `--sh-lime` usage outside an allow-list of selectors: primary button, goal icon/tick, scorebug score, export-render button) to keep neon from creeping back.
- Component: top bar renders Files/Setup/Export/⋯ only; Export panel has scrim + reel summary + settings disclosure; rail has no footer; shortcuts sheet via `?`.
- Browser: screenshots dark + light at 1440×900, 1280×800, 1920×1080, 844×390, 834×1194, 390×844 with ~28 events across 4 files (like the user's GX010278…GX040278), export panel open, render in progress, ⋯ menu open, shortcuts sheet, fullscreen. Look at each; compare against the principles above.
