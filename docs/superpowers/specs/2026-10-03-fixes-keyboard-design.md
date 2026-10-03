# Fixes & Keyboard — Design (Sub-project A)

**Date:** 2026-10-03
**Covers:** #16 (events survive file changes), #19 (keyboard), #2 (click dead zones), #15 (remove manual time entry)
**Status:** Approved in brainstorming

## #16 Events stay attached to their video

### Problem
`MatchEvent.sourceFileIndex` is a position in `files[]`. Three operations break it:
- `FilePills.onPick` / `EmptyPlayer` call `setFiles(newOnly)` — **replaces** the list, so existing events point at the wrong files.
- `removeFile` **deletes** the removed file's events.
- `FilePills.move` reorders `files[]` without touching events.

### Design
- `MatchEvent` gains `sourceFileKey?: string` and `unlinked?: boolean`.
- `fileKey(name)` (pure, `src/utils/fileKey.ts`): the file name. After sub-project B merges, it returns the GoPro recording key (`parseGoProName(name)?.key ?? name`) so events marked on `GL010226.LRV` stay linked when `GX010226.MP4` is loaded instead.
- `relinkEvents(events, files)` (pure, `src/utils/relink.ts`), for each event:
  - has key, file with that key present ⇒ `sourceFileIndex` = its index, `unlinked` removed
  - has key, no such file ⇒ `unlinked: true`, index untouched
  - no key (legacy or freshly created), `files[sourceFileIndex ?? 0]` exists ⇒ assign `sourceFileKey` from that file (today's behaviour, now made durable)
  - no key, no file ⇒ unchanged
- Store runs `relinkEvents` after every change to `files` or `events`: `setFiles`, new `addFiles` (append), `removeFile` (no longer filters events), new `moveFile`, `addEvent`, `setEvents`, `undo`, `redo`.
- `linkedEvents(events)` (pure) filters out `unlinked`. Used by preview (`startPreview`), render, chapters and score counts.
- `GoalList` shows unlinked events greyed with a "file missing" tag in place of `V#`, seek disabled, delete still available.
- Pickers (`FilePills`, `EmptyPlayer`) call `addFiles`.

## #19 Keyboard

| Key | Action |
|---|---|
| ← / → | ±5 s (unchanged) |
| Shift + ← / → | ±1 s |
| ↑ / ↓ | next / previous frame (pause first; fps defaults to 30000/1001) |
| M | add goal only (videojs-hotkeys' built-in mute on M is disabled — it currently mutes *and* adds a goal) |

Implementation via videojs-hotkeys options: `seekStep: (e) => e.shiftKey ? 1 : 5`; `volumeUpKey`/`volumeDownKey`/`muteKey` return `false`; two custom keys for frame stepping. Pure helpers in `src/utils/hotkeys.ts`: `seekStepFor(e)`, `frameStepTime(current, direction, fps, duration)`. CLAUDE.md shortcut table and `EmptyPlayer` hint updated.

## #2 Click dead zones

Investigate in the running app: sample `document.elementFromPoint` across a grid over the player and list the elements that are not the `<video>`/`.vjs-tech`. Overlays that are not interactive get `pointer-events: none`; interactive overlay children keep `pointer-events: auto`. Done when a click anywhere on the picture outside the control bar toggles play/pause (verified in the browser, before/after grid recorded in the plan's task notes).

## #15 Remove manual time entry

`AddGoalBar` loses the time input and `parseTimeToSeconds`. "+ Goal" (needed on touch devices) stays and always uses the current playback time. Team/scorer inputs stay until sub-project C replaces them. `Player.tsx` G/M handler gets the missing `type: 'goal'`.

## Testing

- Unit (node): `fileKey`, `relinkEvents` (add, remove, reorder, re-add, legacy), `linkedEvents`, `seekStepFor`, `frameStepTime`.
- Store: `addFiles` appends and keeps events linked; `removeFile` keeps events as unlinked; `moveFile` follows events; re-adding re-links; undo re-links.
- Component (happy-dom): `GoalList` renders unlinked event with "file missing"; `AddGoalBar` has no time input and adds at current time.
- Manual: dead-zone grid before/after; keyboard behaviours in the browser.

## Merge notes with sub-project B

- B's `RenderHighlights` must pass `linkedEvents(events)` to the segment builder.
- After both merge: switch `fileKey` to use `parseGoProName` (one-line change + test).
- B's `FilePills` picker changes (`accept`, badges) and A's `addFiles` touch the same component; keep both.
