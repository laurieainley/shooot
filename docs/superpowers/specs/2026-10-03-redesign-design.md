# Redesign — "Edit bay" (Sub-project D)

**Date:** 2026-10-03
**Covers:** #11 interface redesign, #12 zoom in fullscreen
**Status:** User delegated the choice ("choose the most promising and implement it; I'll review"). Concepts and rationale: https://claude.ai/code/artifact/ac8c463e-1e2b-44ef-8531-1bd4c2be6fa3 — concept A chosen.
**Depends on:** A, B, C merged; E merged (replay toggle and settings exist in the store).

## Direction

- Discard the current "Stadium Pink" styling and layout entirely (user: generic, less usable than the original plain version).
- Optimise for marking events at speed while watching, then exporting once.
- Identity: match-sheet / edit-bay. Pitch-tinted neutrals, one amber accent (scoreboard bulb) for actions and the playhead, team colours from Match setup for event dots. Type: Barlow Semi Condensed (display: brand, score, headings), Barlow (UI), IBM Plex Mono (timecodes, tabular). Loaded from Google Fonts with system fallbacks.
- Light and dark themes from one token set, following `prefers-color-scheme` (light matters pitch-side in daylight).

## Layout

Desktop (≥ 900px), one screen, no page scroll:

```
┌ top bar: brand · file pills (+ add) · score (team dots) · Match · Export ┐
├──────────────────────────────────────────────┬──────────────────────────┤
│ player (fills available height, 16:9)        │ Events · n      ↶ ⌘Z     │
│                                              │ dense rows (scrolls)     │
├──────────────────────────────────────────────┤                          │
│ match strip: all files end to end            ├──────────────────────────┤
│ clip spans · event dots · kick-off flag      │ Clip −10/+4 · Replay … · │
│ playhead · click to jump                     │ Reel 1:12 · 4 clips      │
├──────────────────────────────────────────────┴──────────────────────────┤
│ key hints                                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

- Right rail ~320px (min 280, max 30%).
- Player: as large as fits; video.js `fill`.
- Empty state (no files): the player area becomes a drop zone with the key hints; rail shows "No events yet".

Phone (< 900px): stacked — compact top bar (brand, score, Export) → video (16:9) → match strip → event list (scrolls) → floating ＋ (bottom-right, safe-area aware) which calls `markEvent`. Picker is the existing bottom sheet, restyled. Match/Export/clip settings open as full-height sheets.

## Components

| Component | Responsibility |
|---|---|
| `AppShell` | Grid layout, responsive switch, theme tokens on root |
| `TopBar` | Brand, `FilePills` (restyled), `ScoreBadge`, Match button, Export button |
| `ScoreBadge` | Team dots + names + running final score (scoring, linked events, team order) |
| `MatchStrip` | Whole-match overview (new) |
| `EventLog` | Replaces `GoalList`: dense rows, selection, inline edit, ↻ replay toggle, delete, bulk paste behind a menu |
| `ClipSummary` | Rail footer: clip before/after, replay window/speed, reel length and clip count; click opens `ClipSettings` popover |
| `ExportPanel` | Replaces `OutputPanel` + `PreviewControls` placement: in-player preview, preview reel (LRV), full render with progress, download/share, chapter copy, project export/import |
| `KeyHints` | One-line shortcut hints (desktop only) |
| `Fab` | Phone ＋ button |
| Existing: `Player`, `EventPicker`, `MatchSetup`, `TimelineMarkers`, `FullscreenControls`, `TimeInput`, `RenderHighlights` | Kept; restyled via tokens; `RenderHighlights` and `ChaptersCopy` move inside `ExportPanel` |

`AddGoalBar` is removed (its role is covered by G, the FAB on phone and an "+ Event" button in the rail header on desktop). `EmptyPlayer` is restyled as the drop zone.

## Match strip

- Pure util `src/utils/matchStrip.ts`: `buildMatchStrip({ files, cumulativeOffsets, events, teams, segments, matchStartSec, currentFileIndex, currentTimeSec }) → { totalSec, files: {name, leftPct, widthPct}[], clips: {leftPct, widthPct}[], events: {id, leftPct, color, title, kind}[], startPct|null, playheadPct }`. Clips come from `mergeOverlappingGoalSegments` (linked events) converted to global time (cross-file segments split at the boundary).
- Click/tap on the strip → global time → `(fileIndex, timeInFile)` via `globalToFileTime(cumulativeOffsets, durations, t)` (pure) → seek (switch file if needed).
- Keyboard: none beyond existing (strip is a pointer affordance).

## Event log

- Row: timecode (match clock if a match start is set, else file time; tabular mono), team dot, `eventLabel` · scorer, file tag only when > 1 file, ↻ (replay effective state), ×. Unlinked rows dimmed with "file missing".
- Click row → select + seek to clip start. Double-click team/scorer → inline edit (team: two buttons; scorer: input with roster filter, reusing `filterRoster`).
- Keyboard (only when the log has focus; never steals G/arrows from the player): ↑/↓ select, Enter seek, Delete/Backspace remove, R toggle replay. Focus is reached by clicking the log or pressing **L**; Esc returns focus to the player.
- Scrolls inside the rail; the page never scrolls on desktop (fixes "removing an event fights the scrollbar").

## Zoom in fullscreen (#12)

- In fullscreen (and normal view), **Z** cycles zoom 1× → 1.5× → 2× → 1×; **Shift+drag** or two-finger drag pans while zoomed; **0** resets. Zoom applies a CSS transform to the video element only (no effect on render). Pure helper `clampPan(zoom, pan, viewport)` keeps the frame covering the viewport.
- Pinch-to-zoom on touch in fullscreen does the same.
- Shown as a small "2×" chip in the corner while zoomed.

(Note: 0–9 seek was disabled in A; **0** is free.)

## Theme tokens (CSS custom properties, mapped into Tailwind `@theme`)

`--paper, --panel, --sunk, --ink, --muted, --line, --accent, --start, --video` with light values on `:root` and dark values under `@media (prefers-color-scheme: dark)`. Replace `--color-deep/surface/pink/yellow/light/muted/border` usages everywhere; no hard-coded colours in components (team colours come from data).

## Testing

- Unit: `buildMatchStrip` (multi-file widths, clip spans incl. cross-file split, playhead, start flag, unlinked excluded), `globalToFileTime`, `clampPan`, zoom cycle.
- Component: `EventLog` (selection keys only when focused, R toggles replay, Delete removes, inline scorer edit), `MatchStrip` (click seeks to the right file/time), `ExportPanel` (shows render buttons and chapter copy), `AppShell` (renders desktop rail at ≥ 900px; FAB under 900px via matchMedia mock).
- Existing tests keep passing (update selectors where markup changed, never weaken assertions).
- Browser: screenshots at 1440×900 and 390×844 in light and dark; manual flow G → picker → event in log → strip dot → export preview.

## Out of scope

- Renaming the product (#20).
- Two cameras, crops.
