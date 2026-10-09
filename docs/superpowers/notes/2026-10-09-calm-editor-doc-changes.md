# Doc changes for AGENTS.md (calm editor, sub-project Y)

Fold these into AGENTS.md when merging `feat/calm-editor`.

## Layout
- Desktop shell is two rows (top bar, bay); the key-hint bar and the rail footer (Clip / Replay / Reel) are gone.
- Top bar: wordmark, `FilesButton` ("4 files · 56:34", warning dot when a file can't play or a proxy has no full file; opens the Files sheet), then Setup (aria "Match setup"), Export, ⋯. All use `.top-btn` (40px, 44px touch, Archivo 700 14px sentence case); Setup, Files, ⋯ are quiet, Export is the only lime button. Phone/landscape: Files shows icon + count, Setup moves into ⋯. No file pills (`FilePills` removed; `AddFilesButton.tsx` remains).
- Render progress: the Export button shows a pulsing red dot + percentage + thin progress line (`utils/exportButton.ts`), then "Ready"/"Failed" for 4 s. `RenderChip` is now overlay-only (folded bar, fullscreen).
- Export is a right-hand drawer (420px; full screen on phones) over a 40% scrim (`FloatingPanel variant="drawer"`). Highlights tab sections: Reel (`ReelSummary`: length + clip count, one-line clip/replay recap, Edit disclosure with `ClipSettings`, Preview in player), Graphics, Render, Share. ⋯ → Advanced settings still opens ClipSettings.
- ⋯ menu: New match…, Files, (Setup on phone/landscape), Advanced settings, Paste list, Send project, Export project, Import project, Shortcuts. Overflow fixed (border-box, `overflow-x: hidden`, close button without negative margin).

## Timeline
- The match strip is the only timeline: video.js progress bar removed (`progressControl: false`), `TimelineMarkers` and `useTouchScrub` deleted. Strip: numbered file bands (name on hover/title), faint clip bands, event icons stacked on up to 3 lanes (`stackLanes` in `utils/matchStrip.ts`), kick-off / half-time / final-whistle flags on the top edge, red playhead with dot, hover/drag time bubble (match clock + file), focusable slider (←/→ use the global seek shortcuts). Touch drags preview and seek on release.

## Icons
- `src/components/icons/EventIcon.tsx` is the one event icon set (football, penalty football with "P", own-goal football with "OG", penalty spot, spot with ✕, goalkeeper glove, whistle, star, flag, pause circle, chequered flag); `utils/eventIcon.ts` maps type + pen to a key and label. Used in strip, event rows (icon replaces the text tag), picker type list, edit-sheet chips (`EventTag` = icon + label). `eventStyle.ts` (tags/ticks) is removed.

## Shortcuts
- `?` (or the small ? button at the bottom right of the rail, or ⋯ → Shortcuts) opens the Shortcuts sheet (`ShortcutsSheet`, data in `utils/shortcutList.ts`, grouped Playback / Tagging / Navigation / Zoom / Editing; test keeps it in sync with `shortcutFor`). `?` is handled in `AppShell`, not the Player.

## Lime rule
- Lime means the single primary action in view (Export, Render, sheet Done) and goals (goal icons, scorebug score). Everything else is chalk/muted: focus rings, selected rows (2px chalk edge), tabs, checkboxes, chips, replay toggle (on = chalk icon on filled surface, off = muted), the FAB (chalk), "+ Tag event" (quiet with red REC dot). Red only for the playhead, REC dots and rendering indicators.
- Guard: `src/utils/limeUsage.test.ts` scans App.css and fails if a lime token appears outside `.btn-primary`, `.top-btn--primary`, `.ev-icon--goal`, `.scorebug__score`.

## Components list changes
- Added: FilesButton, ReelSummary, ShortcutsSheet, ShortcutsButton, icons/EventIcon, AddFilesButton (was FilePills.tsx).
- Removed: ClipSummary, KeyHints, FilePills component, TimelineMarkers, useTouchScrub.
- Fixed: `AddFilesButton` skipped adding files when no `onError` was passed (optional-call short-circuit).
