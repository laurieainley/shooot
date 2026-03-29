# SHOOOT Functional Improvements — Design Spec

## Overview

Five functional improvements to increase the utility of the SHOOOT highlights editor. These changes touch the data model, state management, and UI — but not the FFmpeg render pipeline (which already operates on segments derived from the store).

### Features (in dependency order)

1. **Generalised event types** — rename Goal → Event, add a `type` field
2. **Undo/redo for events** — snapshot-based undo/redo on the events array
3. **File reordering** — arrow buttons to reposition files in the timeline
4. **Expanded timeline visualisation** — interactive bar showing events, segments, and file boundaries
5. **Continuous timeline seeking** — treat all files as one logical video with seamless cross-file seeking

---

## 1. Generalised Event Types

### Data Model

Rename `Goal` to `Event` throughout the codebase. The new type in `types.ts`:

```ts
export type EventType = 'goal' | 'save' | 'foul' | 'card' | 'moment'

export type MatchEvent = {
  id: string
  matchTimeSec: number
  sourceFileIndex?: number
  type: EventType
  team?: string
  scorer?: string
  notes?: string
}
```

The type is named `MatchEvent` (not `Event`) to avoid collision with the DOM `Event` type.

### Colour Map

Each event type gets a colour for use in the timeline and goal list:

| Type | Colour | Usage |
|------|--------|-------|
| `goal` | `#f72585` (pink) | Consistent with existing UI redesign spec |
| `save` | `#4cc9f0` (cyan) | |
| `foul` | `#f4a261` (orange) | |
| `card` | `#fee440` (yellow) | |
| `moment` | `#a0a0a0` (grey) | Generic catch-all |

The colour map lives in a `src/utils/eventColors.ts` constant — pure data, no React.

### Event Type Selection

- **AddGoalBar / AddGoalControls:** Add a `<select>` dropdown for event type, defaulting to `goal`. When type is `goal`, team/scorer fields show. For other types, team still shows (useful for fouls/cards) but scorer is hidden and notes field shows instead.
- **Keyboard shortcut G/M:** Still adds an event, but with type `goal` (the common case). No new shortcuts for other types — use the dropdown.
- **GoalList:** Rename heading to "Events". Each row shows a coloured dot/bar matching the event type. The type is editable via inline dropdown.

### Render Pipeline Impact

The render pipeline (`mergeOverlappingGoalSegments` and `RenderHighlights`) currently processes all goals. Add a filter: **only events with `type: 'goal'` are included in the highlight render by default.** Add a multi-select filter in the render/preview controls to choose which event types to include (e.g. "Include: goals, saves" — so a goalkeeper highlights reel is possible).

### Migration

Existing persisted goals (in IndexedDB via Zustand persist) lack a `type` field. On store hydration, default any event without a `type` to `'goal'`. This is a one-line migration in the Zustand `merge` or `onRehydrateStorage` callback.

---

## 2. Undo/Redo for Events

### Approach

Snapshot-based undo stack on the `events` (formerly `goals`) array. Every action that mutates the events array pushes the previous state onto an undo stack.

### State Shape (additions to `state.ts`)

```ts
// Added to AppState
undoStack: MatchEvent[][]      // previous event states
redoStack: MatchEvent[][]      // states undone
maxUndoDepth: 50               // cap to limit memory

undo: () => void
redo: () => void
```

### Tracked Actions

These event mutations push to the undo stack before executing:

- `addEvent` (renamed from `addGoal`)
- `removeEvent` (renamed from `removeGoal`)
- `updateEvent` (renamed from `updateGoal`)
- `setEvents` (renamed from `setGoals`) — used by bulk paste, import, clear all
- `sortEvents` (renamed from `sortGoals`)
- `reorderFiles` (new — see feature 3; file reorder changes `sourceFileIndex` on events)

### Implementation

Wrap each mutation with a `pushUndo` helper:

```ts
function pushUndo(state: AppState): Partial<AppState> {
  return {
    undoStack: [...state.undoStack.slice(-(state.maxUndoDepth - 1)), state.events],
    redoStack: []  // any new action clears the redo stack
  }
}
```

`undo()` pops from `undoStack`, pushes current to `redoStack`, sets `events`.
`redo()` pops from `redoStack`, pushes current to `undoStack`, sets `events`.

### Keyboard Shortcuts

- **Ctrl/Cmd+Z** — undo (registered as a global `keydown` listener, not a videojs hotkey, so it works regardless of player focus)
- **Ctrl/Cmd+Shift+Z** — redo

### UI

- Small undo/redo buttons near the events list header
- Buttons disabled when their respective stacks are empty
- No toast/notification — the events list update is the feedback

### Persistence

The undo/redo stacks are **not persisted** to IndexedDB. They reset on page reload. Only the current `events` array is persisted (as `goals` is today).

---

## 3. File Reordering

### Interaction

Each file in the file list (or file pill in the redesigned UI) gets left/right arrow buttons:

- **←** moves the file one position earlier (disabled on first file)
- **→** moves the file one position later (disabled on last file)

### State

New action in `state.ts`:

```ts
reorderFile: (fromIndex: number, toIndex: number) => void
```

This action:

1. Pushes current events to the undo stack (because `sourceFileIndex` values change)
2. Reorders the `files` array
3. Updates `sourceFileIndex` on all events to reflect the new file positions
4. Recomputes `cumulativeOffsets`
5. Adjusts `currentFileIndex` if the currently-playing file moved

### Edge Cases

- If the user is currently watching file 2 and moves it to position 0, `currentFileIndex` follows the file (becomes 0), so playback isn't interrupted.
- Events reference files by index, so all events must be remapped when files move. This is why the action pushes to the undo stack.

---

## 4. Expanded Timeline Visualisation

### Layout

A horizontal bar placed directly under the player, approximately 60–80px tall. Full width of the player container.

```
┌──────────────────────────────────────────────────────┐
│                    VIDEO PLAYER                      │
├──────────────────────────────────────────────────────┤
│ FILE 1          │ FILE 2              │ FILE 3       │  ← file regions
│  ●    ●  ██████ │  ●      ████  ●     │    ●  ████  │  ← events + segments
│         ▲                                            │  ← playhead
└──────────────────────────────────────────────────────┘
```

### Elements

1. **File regions** — background bands showing each file's duration as a proportion of total. Subtle divider lines at file boundaries. File number label in each region.
2. **Event markers** — small coloured dots/lines at each event's position on the timeline. Colour corresponds to event type (see feature 1 colour map). Hovering shows a tooltip: timestamp, type, team/scorer.
3. **Highlight segments** — semi-transparent coloured blocks showing the before/after padding region for each event. When segments merge (overlapping padding), the merged block is shown as one continuous region. Uses the pink colour at ~20% opacity.
4. **Playhead** — a vertical line showing the current playback position across the entire timeline. Moves in real-time during playback.
5. **Click to seek** — clicking anywhere on the timeline seeks to that absolute position (which may trigger a file switch — see feature 5).

### Component

New component: `src/components/Timeline.tsx`

Props: none (reads from store). Pure presentation + click handler that dispatches a seek action.

### Data

The timeline needs:
- `files` array with `durationSec` for each file → compute proportional widths
- `cumulativeOffsets` → position events and the playhead on the absolute timeline
- `events` with `matchTimeSec`, `sourceFileIndex`, `type` → place and colour markers
- `mergeOverlappingGoalSegments()` output → draw segment blocks
- `currentFileIndex` + `currentTimeInFileSec` → position the playhead

All of this already exists in the store or is computable from it. No new state needed.

### Responsiveness

On mobile, the timeline remains full-width but reduces height to ~40px. Event markers become taller (easier to tap). Tooltip becomes a tap-and-hold popup.

---

## 5. Continuous Timeline Seeking

### Concept

All loaded files are treated as one logical video with a total duration equal to the sum of individual durations. The user can seek to any absolute position — the app resolves which file to load and what local offset to seek to.

### New State & Actions

```ts
// Additions to AppState
absoluteTimeSec: number  // current position in the full timeline (derived, not stored)

seekToAbsolute: (absoluteTimeSec: number) => void
```

`seekToAbsolute` resolves the absolute time to a `(fileIndex, localTimeSec)` pair using `cumulativeOffsets`, then:

1. If `fileIndex !== currentFileIndex`, sets `currentFileIndex` (triggers video source change)
2. Dispatches a seek to `localTimeSec` on the player (via the existing `seekToGoal` custom event mechanism, or a new `seekToTime` event)

### Auto-Advance

When a video file ends (`ended` event on the player):

1. If there's a next file, show a brief "Loading next file..." overlay (300ms fade, non-blocking)
2. Switch to the next file and auto-play from 0:00
3. If it's the last file, pause at the end (current behaviour)

The overlay is a simple absolutely-positioned div inside the player container. CSS transition only — no animation library.

### Playhead Sync

The player's `timeupdate` event already fires continuously. Update `absoluteTimeSec` as a derived value:

```ts
absoluteTimeSec = cumulativeOffsets[currentFileIndex] + currentTimeInFileSec
```

This drives the timeline playhead (feature 4) and can be displayed in the player info bar.

### Timeline Click Integration

When the user clicks the timeline (feature 4), the click handler computes the absolute time from the click position and calls `seekToAbsolute`. This is the primary way cross-file seeking happens — the user doesn't need to think about which file they're in.

### Edge Cases

- **Seeking to a position during render:** No conflict — render reads from the `files` array and `events`, not the player state.
- **File removed while playing:** If the currently-playing file is removed, fall back to the nearest valid file (or file 0).
- **Empty gaps:** There are no gaps between files — `cumulativeOffsets` are contiguous by definition.

---

## Scope Boundaries

### In scope
- All five features described above
- Renaming `Goal` → `MatchEvent` throughout codebase (types, state, components, utils, tests)
- New `Timeline` component
- Undo/redo state management
- File reorder action with event index remapping
- Continuous seeking via `seekToAbsolute`
- Auto-advance overlay

### Out of scope
- UI redesign / Tailwind migration (covered by separate spec)
- FFmpeg render pipeline changes (it already works with segments; event type filtering is a pre-render filter)
- Thumbnail extraction
- Per-clip padding overrides
- Drag-and-drop file reordering
- New keyboard shortcuts beyond Ctrl+Z / Ctrl+Shift+Z

---

## Migration & Backwards Compatibility

- **IndexedDB persisted state:** Existing `goals` array is rehydrated as `events` with `type: 'goal'` defaulted. The Zustand persist key should stay the same to preserve data; only the shape changes.
- **Project JSON import/export:** Accept both `{ goals: [...] }` (legacy) and `{ events: [...] }` (new) formats. On import of legacy format, map goals to events with `type: 'goal'`.
- **Tests:** Existing util tests reference `Goal` type and goal-specific function names. These will be updated to use the new names as part of implementation.
