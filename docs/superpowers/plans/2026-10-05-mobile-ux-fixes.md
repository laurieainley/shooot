# Mobile & Editing Fixes — Implementation Plan (Sub-project F)

Spec: `docs/superpowers/specs/2026-10-05-mobile-ux-fixes-design.md`. Red-green TDD per task; one commit per task.
Baseline: 254 tests (41 files), lint 23 problems, `tsc -b` clean.

## 1. Replay default (#19)
- `src/state.ts`: `replayBeforeSec: 4`.
- Test (`state.test.ts`): initial state is 4 s / 1 s / 0.5×.

## 2. Panel state: menus and sheets are mutually exclusive (#1, #13)
- `src/state.ts`: `panel: Panel | null` (`'menu' | 'files' | 'match' | 'settings' | 'paste' | 'export'`), `openPanel`, `closePanel`.
  Opening a panel closes the picker (keep); `markEvent` / `openPicker` close any panel.
  The picker is cleared whenever its event disappears (remove, undo, setEvents, newMatch) — fixes ＋ hidden after adding (#8b).
- Tests (`state.test.ts`): openPanel closes picker; markEvent closes panel; undo of a marked event clears the picker.

## 3. Sheet + unified ⋯ menu (#1, #13, #6, #18)
- New `Sheet.tsx`: responsive sheet (centred ≤ 560 px on desktop / landscape, bottom sheet on phone portrait, internal scroll), Esc / backdrop close.
- New `OverflowMenu.tsx` (top bar ⋯ on desktop and phone): New match… (inline confirm), Files, Match setup, Advanced settings, Paste list, Export / Import project.
- New `PasteList.tsx` (moved out of EventLog). `MatchSetup` renders in `Sheet`. Advanced settings = `ClipSettings` in `Sheet`.
- `EventLog`: header keeps + Event, undo, redo; no ⋯. `ExportPanel`: store-driven open state, Project section moved to the menu.
- `ClipSummary`: plain read-only text (no button, no popover).
- Tests: `OverflowMenu.test.tsx` (entries; paste list adds events; new match confirm/keep; Advanced settings opens ClipSettings; opening closes the picker),
  `ClipSummary` non-interactive, `AppShell` (⋯ on both layouts, no ⋯ in event log), `ExportPanel` (no project section).

## 4. Files sheet and loading indicator (#6, #7)
- `state.ts`: `replaceFile(index, replacement[])`, `opening: string | null`.
- `utils/opening.ts`: `formatBytes`, `openingLabel(name, bytes)` → `Opening GX010226.MP4 (11.9 GB)…`.
- `addFiles.ts`: sets `opening` per probed file, clears it at the end; `replacePickedFiles(index, files)`.
- New `FilesSheet.tsx`: rows with tap-to-switch, ↑/↓, remove, Replace…; Add files; `OpeningStatus` row.
- New `OpeningStatus.tsx` used in EmptyPlayer, FilePills, FilesSheet; Add files buttons disabled while opening.
- Tests: `opening.test.ts`, `state.test.ts` (replaceFile unlinks events of the old file), `FilesSheet.test.tsx` (switch, reorder, remove, replace), loading indicator shown + Add disabled.

## 5. Touch copy and picker buttons (#8, #10)
- `useMediaQuery.ts`: `COARSE_QUERY = '(pointer: coarse)'`.
- `EventLog` empty copy by pointer; `EventPicker` Done / Cancel on coarse pointer, hint hidden there.
- Tests: `EventLog.test.tsx` copy for coarse / fine; `EventPicker.test.tsx` Done keeps, Cancel removes, hint hidden.

## 6. Tap gestures, overlay, FAB in fullscreen (#2, #21, #12, #8b)
- `utils/tap.ts`: `tapZoneAt(x, width)` (thirds), `isDoubleTap(last, tap, windowMs)`.
- `FullscreenControls`: left / centre / right zones (thirds), single tap toggles play (centre immediately), double tap on sides seeks ±5 s;
  shown on coarse pointers and in fullscreen; old "Event" overlay button removed; controls shown on tap (`userActive`).
- `Player`: renders `<Fab />` inside the container while fullscreen. `Fab` hidden only while the picker is actually showing.
- Tests: `tap.test.ts`; `FullscreenControls.test.tsx` (centre tap toggles, no Event button); `Fab` visible after picker closes / event removed.

## 7. Scrubbing on touch (#4)
- `utils/scrub.ts`: `scrubReducer(state, action)` → effects (`pause`, `preview`, `seek`, `play`); `scrubTimeAt(x, rect, duration)`.
- `Player`: capture `touchstart` on the progress control, show a time bubble, update the strip playhead, one seek on release, restore playing.
- Tests: `scrub.test.ts` (drag → no seek; release → exactly one seek; resumes if it was playing; cancel → no seek).

## 8. Fullscreen re-entry and orientation (#3)
- `fullscreen.ts`: `isFullscreen()` = document fullscreen element is the container; on `resize` / `orientationchange` resync the video.js class
  and state; after entering on a coarse pointer try `screen.orientation.lock('landscape')` (ignore failures).
- Tests (`fullscreen.test.ts`): stale class after leaving fullscreen does not block re-entry; orientation lock attempted and failures ignored.

## 9. Player options (#6, #11)
- `utils/playerOptions.ts`: video.js options — no picture-in-picture button, elapsed `current / duration` instead of remaining.
- CSS: show current time / divider / duration; touch targets ≥ 44 px under `(pointer: coarse)` (control bar, row buttons, picker chips).
- Tests: `playerOptions.test.ts`.

## 10. Preview with replays (#20)
- `utils/preview.ts`: `buildPreviewPlan(segments, durations, replay)` → steps (clip / replay, speed, clip index) from the render plan;
  `shouldAdvance(t, step, armed)`.
- `state.ts`: `startPreview` builds steps from clip 1; `previewSteps` alongside `previewSegments`.
- `Player`: seek-then-arm (no advancing before the seek lands → always starts at clip 1), `playbackRate = speed`, 50 % volume on replays.
- `PreviewControls`: clip n / N with replay tag, Exit always, Esc exits on desktop. `AppShell`: phone preview bar below the video.
- Tests: `preview.test.ts`, `state.test.ts` (starts at step 0, includes replay steps), `PreviewControls` (label, Esc).

## 11. Replay audio at 50 % (#22)
- `render/audioStretch.ts`: WSOLA `timeStretch(samples, channels, factor)`; tests on sine data (length ≈ input / speed, frequency within ±2 %).
- `render/replayAudio.ts`: decode the replay span (mediabunny `AudioSampleSink` → WebCodecs), stretch, gain 0.5, AAC-LC encode (`AudioEncoder`).
- `render/types.ts`: `Cut.gain`. `renderPlan`: replay cuts `{ speed, gain: 0.5 }` (no longer silent).
- `mediabunnyEngine.ts`: re-encode only replay audio; fallback silent frames → gap. Keyframe snapping, end clamping, open-GOP drop,
  compatibility checks and partial-output cleanup unchanged.
- Verify with a real render in headless Chrome (H.264 and HEVC, 30000/1001, keyint 30, AAC 48 kHz stereo tone):
  replay audio present ≈ −6 dB vs the clip, duration correct, `ffmpeg -v error -f null -` clean.

## 12. Page-level touch CSS (#9, #16, #6)
- `overscroll-behavior-y: contain` on html/body and scroll containers; `touch-action: none` on the video surface;
  replay toggle fill by `aria-pressed` only, no sticky hover on `(hover: none)`; phone landscape: video fits the height.

## 13. Browser verification
- Headless system Chrome, touch emulation, 390×844 and 844×390, dev server on 5180; screenshots `scratchpad/design/f-*.png`.
