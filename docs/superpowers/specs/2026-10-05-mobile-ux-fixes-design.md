# Mobile & Editing Fixes — Design (Sub-project F)

**Date:** 2026-10-05
**Source:** user review of the deployed edit-bay redesign (numbers refer to the user's list).
**Status:** Approved in conversation ("F: starting now").

## Menus and settings

- **#1, #13** One overflow menu: the top-bar ⋯ (both desktop and phone) holds **New match…** (inline confirm, as now), **Files** (phone: add / switch / replace / reorder / remove), **Match setup**, **Advanced settings**, **Paste list**, **Project export / import**. Remove the ⋯ from the event-log header (keep + Event, undo, redo there). Menus and sheets are mutually exclusive: opening one closes any other, and nothing overlaps the event picker (opening a menu closes the picker as "keep").
- **#18, #7b** Rail/phone footer shows Clip / Replay / Reel as **plain read-only text** (not a button). Editing moves to ⋯ → Advanced settings (sheet on phone, popover on desktop).
- **#19** Replay defaults: 4 s before, 1 s after (`replayBeforeSec: 4`). Persisted users keep their values; only the initial default changes.
- **#6** Match setup and Advanced settings are responsive sheets: max-width ~560 px centred on desktop/landscape, full-width bottom sheet with internal scroll on phone portrait; never stretch full-screen in landscape. Phone file switching: a **Files** sheet (from ⋯) listing loaded files with tap-to-switch, ↑/↓ reorder, remove, "Add files", "Replace…" (pick new files to swap one entry; events on the old file become unlinked as with remove).

## Player on touch devices

- **#2** Double-tap left / right third of the video seeks −5 s / +5 s in normal, fullscreen and zoomed modes. Single tap anywhere on the picture toggles play/pause (**#21**: centre taps currently hide the controls instead).
- **#2** Zoom (pinch / Z) transforms only the video picture inside a fixed-size frame; overlay controls, ＋, picker and video.js control bar keep their position and size.
- **#9** Pull-to-refresh: `overscroll-behavior-y: contain` on `html, body` and the scroll containers; `touch-action: none` on the video surface (gestures handled by our code) so swipes on the video never scroll the page.
- **#4** Scrubbing on touch: dragging the progress bar does **not** seek continuously. While dragging, show a time bubble above the finger (and the match-strip playhead follows); seek once on release. Playback state is restored after the seek (playing stays playing).
- **#3** Orientation: fullscreen uses the container (C). On `orientationchange`/`resize`, if the container was fullscreen and the document left fullscreen, do not fight it, but make sure re-entering works: reset any stale state so the fullscreen button / F / double-click call `requestFullscreen` again (bug: second entry failed). Try `screen.orientation.lock('landscape')` after entering fullscreen on phones (ignore failures).
- **#12** Remove the old top-left "Event" overlay button in fullscreen everywhere; the ＋ FAB is the only touch entry point and is shown in fullscreen too (inside the fullscreen container, safe-area aware).
- **#8b** ＋ disappears after adding an event — fix so it is visible whenever the picker is closed.
- **#6** Landscape phones: touch targets ≥ 44 px (control bar buttons, rail row actions, picker chips). Remove the picture-in-picture button from the video.js control bar.
- **#11** Player time display shows elapsed `current / duration`, not remaining.

## Event picker on touch

- **#10** Bottom sheet gets explicit **Done** (keep current state, close) and **Cancel** (delete the just-created event) buttons; hide the "Esc to finish · ⌫ cancel" hint on touch (`(pointer: coarse)`).

## Feedback and states

- **#7** Loading indicator while files are probed/opened: a progress row in the file area / empty state ("Opening GX010226.MP4 (11.9 GB)…") with a spinner; disables "Add files" meanwhile.
- **#8** Empty-state copy depends on input: coarse pointer → "No events yet. Tap ＋ while the video plays."; fine pointer → "…press G…".
- **#16** Replay toggle: state shown by fill/colour driven only by `aria-pressed`; remove sticky `:hover`/`:focus` styling on touch (`@media (hover: none)`), so tapping clearly toggles amber on/off.

## Preview (#20)

- Starts at the first clip of the reel every time.
- Includes replays: plays the replay window at the replay speed (`playbackRate = replaySpeed`, muted or at 50% volume to mirror the render) after the clip.
- Phone: preview bar sits **below** the video (in the stack), not over it; always shows an **Exit** button; Esc exits on desktop.

## Replay audio at 50% volume (#22)

- Replays keep their audio: slowed to match the picture (pitch preserved), at 50% volume. Only the replay's audio is re-encoded (WebCodecs `AudioDecoder` → time-stretch → gain 0.5 → `AudioEncoder`, AAC-LC with the source's rate/channels); video stays stream-copied.
- Time-stretch: WSOLA (pure function `timeStretch(samples, channels, factor)` in `src/render/audioStretch.ts`, unit-tested on synthetic sine data: output length ≈ input / speed, pitch preserved — dominant frequency within ±2 %).
- Fallback order if AAC encode/decode is unavailable: silent frames (current behaviour), then gap.

## Testing

- Unit: `timeStretch`; scrub state machine (drag → no seek, release → one seek); double-tap zone/timing helper; replay default.
- Component: unified ⋯ menu entries; picker Done/Cancel on coarse pointer; empty-state copy by pointer type; footer is non-interactive; preview starts at clip 1 and includes replay segments; loading indicator shown while probing.
- Browser (headless Chrome with touch emulation `hasTouch: true, isMobile: true`, 390×844 portrait and 844×390 landscape): double-tap seek in normal and zoomed; ＋ visible after adding an event and in fullscreen; no overlap between menu and picker; no PiP button; elapsed time shown; screenshots for review.
- Real-device items listed for the user (orientation/fullscreen re-entry, pull-to-refresh, scrubbing feel).
