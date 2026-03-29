# Functional Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add generalised event types, undo/redo, file reordering with event remapping, an expanded timeline visualisation, and continuous cross-file seeking.

**Architecture:** The data model changes first (Goal → MatchEvent with `type` field), then undo/redo wraps all event mutations, file reordering gets event index remapping, the Timeline component renders an interactive bar from store data, and continuous seeking resolves absolute positions to file+offset pairs. Each feature builds on the previous but produces a working, testable app after each task.

**Tech Stack:** React 19, TypeScript, Zustand 5, Vitest, Tailwind CSS v4 (already configured with Stadium Pink theme)

---

## File Structure

### New Files
- `src/utils/eventColors.ts` — colour map constant for event types
- `src/utils/eventColors.test.ts` — tests for colour map
- `src/utils/timelinePosition.ts` — pure functions: `resolveAbsoluteTime()`, `absoluteTimeFromFilePosition()`
- `src/utils/timelinePosition.test.ts` — tests for timeline position utils
- `src/components/Timeline.tsx` — interactive expanded timeline visualisation

### Modified Files
- `src/types.ts` — rename `Goal` → `MatchEvent`, add `EventType`
- `src/state.ts` — rename all goal actions to event actions, add undo/redo stacks, add `reorderFile` with index remapping, add `seekToAbsolute`, migration v7→v8
- `src/utils/highlights.ts` — update `Goal` → `MatchEvent` import, add event type filtering
- `src/utils/highlights.test.ts` — update type references
- `src/utils/timeline.ts` — no logic changes, just type import update
- `src/utils/timeline.test.ts` — no changes needed (doesn't reference Goal type)
- `src/utils/chapters.ts` — update `Goal` → `MatchEvent` import
- `src/utils/chapters.test.ts` — update type references
- `src/components/AddGoalBar.tsx` — add event type dropdown, rename goal → event
- `src/components/GoalList.tsx` — rename heading, add coloured type indicator, add event type dropdown per row, add undo/redo buttons
- `src/components/OutputPanel.tsx` — add event type filter for render/preview
- `src/components/PreviewControls.tsx` — pass filtered events
- `src/components/RenderHighlights.tsx` — use filtered events
- `src/components/FilePills.tsx` — wire reorder to new `reorderFile` action (which remaps event indices + pushes undo)
- `src/components/Player.tsx` — update `addGoal` → `addEvent` with type, add auto-advance overlay, integrate `seekToAbsolute` for timeline clicks
- `src/App.tsx` — add Timeline component between Player and AddGoalBar, add global undo/redo keyboard listener

---

## Task 1: Rename Goal → MatchEvent and Add EventType

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils/highlights.ts`
- Modify: `src/utils/highlights.test.ts`
- Modify: `src/utils/chapters.ts`
- Modify: `src/utils/chapters.test.ts`
- Modify: `src/utils/timeline.ts`
- Modify: `src/state.ts`
- Modify: `src/components/AddGoalBar.tsx`
- Modify: `src/components/GoalList.tsx`
- Modify: `src/components/OutputPanel.tsx`
- Modify: `src/components/PreviewControls.tsx`
- Modify: `src/components/RenderHighlights.tsx`
- Modify: `src/components/FilePills.tsx`
- Modify: `src/components/Player.tsx`
- Modify: `src/App.tsx`
- Create: `src/utils/eventColors.ts`
- Create: `src/utils/eventColors.test.ts`

### Step-by-step

- [ ] **Step 1: Update types.ts**

Replace the `Goal` type with `MatchEvent` and add `EventType`:

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

// Keep backward-compat alias for migration
export type Goal = MatchEvent
```

Keep the `VideoSourceFile` and `TimelineFile` types unchanged.

- [ ] **Step 2: Create eventColors.ts**

```ts
// src/utils/eventColors.ts
import type { EventType } from '../types'

export const EVENT_COLORS: Record<EventType, string> = {
    goal: '#f72585',
    save: '#4cc9f0',
    foul: '#f4a261',
    card: '#fee440',
    moment: '#a0a0a0',
}

export const EVENT_LABELS: Record<EventType, string> = {
    goal: 'Goal',
    save: 'Save',
    foul: 'Foul',
    card: 'Card',
    moment: 'Moment',
}

export function getEventColor(type: EventType): string {
    return EVENT_COLORS[type]
}
```

- [ ] **Step 3: Write eventColors tests**

```ts
// src/utils/eventColors.test.ts
import { describe, it, expect } from 'vitest'
import { getEventColor, EVENT_COLORS, EVENT_LABELS } from './eventColors'

describe('getEventColor', () => {
    it('should return pink for goal type', () => {
        expect(getEventColor('goal')).toBe('#f72585')
    })

    it('should return a colour for every event type', () => {
        const types = ['goal', 'save', 'foul', 'card', 'moment'] as const
        for (const type of types) {
            expect(getEventColor(type)).toBeTruthy()
        }
    })
})

describe('EVENT_LABELS', () => {
    it('should have a label for every event type', () => {
        const types = ['goal', 'save', 'foul', 'card', 'moment'] as const
        for (const type of types) {
            expect(EVENT_LABELS[type]).toBeTruthy()
        }
    })
})
```

- [ ] **Step 4: Run tests to verify new util passes**

Run: `npx vitest run src/utils/eventColors.test.ts`
Expected: PASS

- [ ] **Step 5: Rename Goal → MatchEvent across all utils**

In `src/utils/highlights.ts`, change:
- `import type { Goal }` → `import type { MatchEvent }`
- All references to `Goal` in the type annotations → `MatchEvent`
- Keep the function name `mergeOverlappingGoalSegments` (it's a well-known name in the codebase)
- The `HighlightSegment.goals` field stays as `goals: MatchEvent[]` (rename would be churn)

In `src/utils/chapters.ts`, change:
- `import type { Goal }` → `import type { MatchEvent }`
- Function parameter types from `Goal[]` → `MatchEvent[]`

In `src/utils/timeline.ts`:
- No changes needed — it doesn't reference `Goal` type

- [ ] **Step 6: Update test files to use MatchEvent**

In `src/utils/highlights.test.ts`, change:
- `import type { Goal }` → `import type { MatchEvent }`
- The helper function: `function goal(id: string, matchTimeSec: number, sourceFileIndex = 0): MatchEvent`
  - Add `type: 'goal' as const` to the returned object

In `src/utils/chapters.test.ts`, change:
- `import type { Goal }` → `import type { MatchEvent }`
- The helper function: `function goal(...): MatchEvent`
  - Add `type: 'goal' as const` to the returned object

- [ ] **Step 7: Run all util tests**

Run: `npx vitest run src/utils/`
Expected: All tests PASS

- [ ] **Step 8: Update state.ts — rename goal actions to event actions**

In `src/state.ts`:

1. Change import: `import type { Goal, VideoSourceFile }` → `import type { MatchEvent, VideoSourceFile }`
2. In the `AppState` type, rename:
   - `goals: Goal[]` → `events: MatchEvent[]`
   - `addGoal: (goal: Goal) => void` → `addEvent: (event: MatchEvent) => void`
   - `setGoals: (goals: Goal[]) => void` → `setEvents: (events: MatchEvent[]) => void`
   - `removeGoal: (id: string) => void` → `removeEvent: (id: string) => void`
   - `updateGoal: (id: string, partial: Partial<Goal>) => void` → `updateEvent: (id: string, partial: Partial<MatchEvent>) => void`
   - `sortGoals: () => void` → `sortEvents: () => void`
3. In the implementation, rename all `goals` → `events`, `addGoal` → `addEvent`, etc.
4. Update the `partialize` function to persist `events` instead of `goals`
5. Update migration to handle `goals` → `events` rename and add default `type: 'goal'` to events without a type:

```ts
version: 8,
migrate: (persistedState: any, version: number) => {
    let state = persistedState ?? {}

    // Migrate goals → events (v7 → v8)
    if ('goals' in state) {
        state = {
            ...state,
            events: (state.goals as any[]).map((g: any) => ({
                ...g,
                type: g.type ?? 'goal',
            })),
        }
        delete state.goals
    }

    // Ensure all events have a type field
    if (state.events) {
        state.events = (state.events as any[]).map((e: any) => ({
            ...e,
            type: e.type ?? 'goal',
        }))
    }

    // Legacy migrations (keep for users upgrading from very old versions)
    if (version < 3 && !('matchStartTimeSec' in state)) {
        state.matchStartTimeSec = 0
    }
    if (version < 5) {
        delete state.slowMotionEnabled
        delete state.slowMotionSpeed
    }
    if (version < 6 && !('adjustTimestampsByOffset' in state)) {
        state.adjustTimestampsByOffset = false
    }
    if (version < 7) {
        state.lengthBeforeGoalSec = state.lengthBeforeGoalSec ?? 10
        state.lengthAfterGoalSec = state.lengthAfterGoalSec ?? 4
    }

    return state
},
```

6. In the `startPreview` action, update `state.goals` → `state.events`
7. In `removeFile`, update `get().goals` → `get().events` and `goals:` → `events:`
8. In `clear`, update `goals: []` → `events: []`

- [ ] **Step 9: Update all components to use new action/state names**

This is a mechanical rename across all components. For each file:

**`src/components/AddGoalBar.tsx`:**
- `useAppState((s) => s.addGoal)` → `useAppState((s) => s.addEvent)`
- `const goal: Goal = { ... }` → `const event: MatchEvent = { id: ..., matchTimeSec, sourceFileIndex: currentFileIndex, type: 'goal', team: team || undefined, scorer: scorer || undefined }`
- `addGoal(goal)` → `addEvent(event)`
- Add `type` import: `import type { MatchEvent } from '../types'`

**`src/components/GoalList.tsx`:**
- `useAppState((s) => s.goals)` → `useAppState((s) => s.events)`
- `useAppState((s) => s.removeGoal)` → `useAppState((s) => s.removeEvent)`
- `useAppState((s) => s.updateGoal)` → `useAppState((s) => s.updateEvent)`
- `useAppState((s) => s.sortGoals)` → `useAppState((s) => s.sortEvents)`
- `useAppState((s) => s.addGoal)` → `useAppState((s) => s.addEvent)`
- Update `parseLine` to return `MatchEvent` with `type: 'goal'`
- Update `import type { Goal }` → `import type { MatchEvent }`

**`src/components/OutputPanel.tsx`:**
- `useAppState((s) => s.goals)` → `useAppState((s) => s.events)`
- Update score counting to filter for `type === 'goal'` only

**`src/components/PreviewControls.tsx`:**
- `useAppState((s) => s.goals)` → `useAppState((s) => s.events)`
- Display count of events, not goals

**`src/components/RenderHighlights.tsx`:**
- `useAppState((s) => s.goals)` → `useAppState((s) => s.events)`
- Keep passing `events` to `mergeOverlappingGoalSegments` (it accepts `MatchEvent[]` now)

**`src/components/FilePills.tsx`:**
- No Goal/MatchEvent references — no changes needed here

**`src/components/Player.tsx`:**
- `useAppState((s) => s.addGoal)` → `useAppState((s) => s.addEvent)`
- In the hotkey handler, update `addGoal({...})` → `addEvent({ ..., type: 'goal' })`
- `goals.length` → `events.length` if referenced (check preview segment display)

**`src/App.tsx`:**
- `useAppState((s) => s.goals)` → `useAppState((s) => s.events)`
- `useAppState((s) => s.setGoals)` → `useAppState((s) => s.setEvents)`
- In `onImport`, accept both `data.goals` and `data.events`:
```ts
const events = Array.isArray(data.events) ? data.events : Array.isArray(data.goals) ? data.goals : null
if (events) {
    setEvents(events.map((e: any) => ({ ...e, type: e.type ?? 'goal' })))
}
```
- In `onExport`, export as `{ events }` but also include `goals` for backward compat:
```ts
const blob = new Blob([JSON.stringify({ events, goals: events }, null, 2)], { type: 'application/json' })
```

- [ ] **Step 10: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 11: Commit**

```bash
git add src/types.ts src/utils/eventColors.ts src/utils/eventColors.test.ts src/utils/highlights.ts src/utils/highlights.test.ts src/utils/chapters.ts src/utils/chapters.test.ts src/utils/timeline.ts src/state.ts src/components/AddGoalBar.tsx src/components/GoalList.tsx src/components/OutputPanel.tsx src/components/PreviewControls.tsx src/components/RenderHighlights.tsx src/components/Player.tsx src/App.tsx
git commit -m "feat: rename Goal to MatchEvent, add EventType and event colours"
```

---

## Task 2: Undo/Redo for Events

**Files:**
- Modify: `src/state.ts`
- Modify: `src/components/GoalList.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add undo/redo state and actions to state.ts**

Add to the `AppState` type:

```ts
// Undo/redo
undoStack: MatchEvent[][]
redoStack: MatchEvent[][]
undo: () => void
redo: () => void
```

Add initial values:

```ts
undoStack: [],
redoStack: [],
```

Add a `pushUndo` helper (defined inside the `persist` callback, before the return object):

```ts
const MAX_UNDO_DEPTH = 50

function pushUndo(state: AppState): { undoStack: MatchEvent[][]; redoStack: MatchEvent[][] } {
    return {
        undoStack: [...state.undoStack.slice(-(MAX_UNDO_DEPTH - 1)), state.events],
        redoStack: [],
    }
}
```

Update every event-mutating action to push undo before mutating. For each action, wrap the `set()` call to include `...pushUndo(get())`:

**`addEvent`:**
```ts
addEvent: (event) => {
    const state = get()
    const newEvents = [...state.events, event]
    const sortedEvents = newEvents.sort((a, b) => {
        const aTime = (state.cumulativeOffsets[a.sourceFileIndex ?? 0] || 0) + a.matchTimeSec
        const bTime = (state.cumulativeOffsets[b.sourceFileIndex ?? 0] || 0) + b.matchTimeSec
        return aTime - bTime
    })
    set({ events: sortedEvents, ...pushUndo(state) })
},
```

**`removeEvent`:**
```ts
removeEvent: (id) => {
    const state = get()
    set({ events: state.events.filter((e) => e.id !== id), ...pushUndo(state) })
},
```

**`updateEvent`:**
```ts
updateEvent: (id, partial) => {
    const state = get()
    set({ events: state.events.map((e) => (e.id === id ? { ...e, ...partial } : e)), ...pushUndo(state) })
},
```

**`setEvents`:**
```ts
setEvents: (events) => {
    const state = get()
    set({ events, ...pushUndo(state) })
},
```

**`sortEvents`:**
```ts
sortEvents: () => {
    const state = get()
    const sortedEvents = [...state.events].sort((a, b) => {
        const aTime = (state.cumulativeOffsets[a.sourceFileIndex ?? 0] || 0) + a.matchTimeSec
        const bTime = (state.cumulativeOffsets[b.sourceFileIndex ?? 0] || 0) + b.matchTimeSec
        return aTime - bTime
    })
    set({ events: sortedEvents, ...pushUndo(state) })
},
```

Add undo and redo actions:

```ts
undo: () => {
    const state = get()
    if (state.undoStack.length === 0) return
    const previous = state.undoStack[state.undoStack.length - 1]
    set({
        events: previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.events],
    })
},
redo: () => {
    const state = get()
    if (state.redoStack.length === 0) return
    const next = state.redoStack[state.redoStack.length - 1]
    set({
        events: next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, state.events],
    })
},
```

Exclude `undoStack` and `redoStack` from persistence (they're already excluded since `partialize` only includes `events`, `matchStartTimeSec`, etc.).

- [ ] **Step 2: Add undo/redo buttons to GoalList**

In `src/components/GoalList.tsx`, add undo/redo buttons to the header row:

```tsx
const undo = useAppState((s) => s.undo)
const redo = useAppState((s) => s.redo)
const undoStack = useAppState((s) => s.undoStack)
const redoStack = useAppState((s) => s.redoStack)
```

In the header `div` (the one with "Goals" and "X marked"), add between the label and the count:

```tsx
<div className="flex items-center justify-between mb-2">
    <span className="text-xs font-bold uppercase tracking-wider text-light">Events</span>
    <div className="flex items-center gap-2">
        <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="text-[10px] text-muted hover:text-light bg-transparent border-none p-0 cursor-pointer disabled:opacity-30"
            title="Undo (Ctrl+Z)"
        >↩</button>
        <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="text-[10px] text-muted hover:text-light bg-transparent border-none p-0 cursor-pointer disabled:opacity-30"
            title="Redo (Ctrl+Shift+Z)"
        >↪</button>
        <span className="text-xs text-muted">{events.length} marked</span>
    </div>
</div>
```

Also rename the "Goals" heading to "Events" and update `goals` variable to `events` throughout.

- [ ] **Step 3: Add global keyboard listener for Ctrl+Z / Ctrl+Shift+Z in App.tsx**

In `src/App.tsx`, add a `useEffect` for the keyboard listener:

```tsx
useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const isMod = e.metaKey || e.ctrlKey
        if (isMod && e.key === 'z' && !e.shiftKey) {
            e.preventDefault()
            useAppState.getState().undo()
        } else if (isMod && e.key === 'z' && e.shiftKey) {
            e.preventDefault()
            useAppState.getState().redo()
        }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Manual smoke test**

1. Load a video, add 2-3 events
2. Press Ctrl+Z — last event should disappear
3. Press Ctrl+Z again — second-to-last event should disappear
4. Press Ctrl+Shift+Z — event reappears
5. Add a new event after undoing — redo stack should clear (Ctrl+Shift+Z does nothing)

- [ ] **Step 6: Commit**

```bash
git add src/state.ts src/components/GoalList.tsx src/App.tsx
git commit -m "feat: add undo/redo for event mutations (Ctrl+Z / Ctrl+Shift+Z)"
```

---

## Task 3: File Reordering with Event Index Remapping

**Files:**
- Modify: `src/state.ts`
- Modify: `src/components/FilePills.tsx`

- [ ] **Step 1: Add reorderFile action to state.ts**

Add to `AppState` type:

```ts
reorderFile: (fromIndex: number, toIndex: number) => void
```

Add implementation:

```ts
reorderFile: (fromIndex, toIndex) => {
    const state = get()
    if (toIndex < 0 || toIndex >= state.files.length) return
    if (fromIndex === toIndex) return

    // Build index mapping: oldIndex → newIndex
    const newFiles = state.files.slice()
    const [moved] = newFiles.splice(fromIndex, 1)
    newFiles.splice(toIndex, 0, moved)

    // Build the mapping from old file index to new file index
    const indexMap = new Map<number, number>()
    for (let oldIdx = 0; oldIdx < state.files.length; oldIdx++) {
        const file = state.files[oldIdx]
        const newIdx = newFiles.indexOf(file)
        indexMap.set(oldIdx, newIdx)
    }

    // Remap sourceFileIndex on all events
    const remappedEvents = state.events.map(e => ({
        ...e,
        sourceFileIndex: indexMap.get(e.sourceFileIndex ?? 0) ?? e.sourceFileIndex,
    }))

    // Follow the currently playing file
    const newCurrentFileIndex = indexMap.get(state.currentFileIndex) ?? state.currentFileIndex

    set({
        files: newFiles,
        events: remappedEvents,
        cumulativeOffsets: computeCumulativeOffsets(newFiles),
        currentFileIndex: newCurrentFileIndex,
        ...pushUndo(state),
    })
},
```

Note: `pushUndo` is called here so that file reorder (which remaps event indices) is undoable.

- [ ] **Step 2: Update FilePills to use reorderFile**

In `src/components/FilePills.tsx`, replace the local `move` function:

```tsx
const reorderFile = useAppState((s) => s.reorderFile)
```

Replace the `move(i, i - 1)` and `move(i, i + 1)` calls with `reorderFile(i, i - 1)` and `reorderFile(i, i + 1)`.

Remove the local `move` function entirely.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Manual smoke test**

1. Load 2+ videos, add events referencing both files
2. Move file 2 to position 1
3. Verify events still reference the correct files (check V1/V2 labels in the events list)
4. Undo — files and events should revert
5. Redo — reorder should reapply

- [ ] **Step 5: Commit**

```bash
git add src/state.ts src/components/FilePills.tsx
git commit -m "feat: file reordering remaps event sourceFileIndex, integrated with undo"
```

---

## Task 4: Timeline Position Utils

**Files:**
- Create: `src/utils/timelinePosition.ts`
- Create: `src/utils/timelinePosition.test.ts`

- [ ] **Step 1: Write failing tests for resolveAbsoluteTime**

```ts
// src/utils/timelinePosition.test.ts
import { describe, it, expect } from 'vitest'
import { resolveAbsoluteTime, absoluteTimeFromFilePosition } from './timelinePosition'

describe('resolveAbsoluteTime', () => {
    it('should resolve to first file when absolute time is within first file', () => {
        // offsets: [0, 60, 150], durations: [60, 90, 30]
        const result = resolveAbsoluteTime(30, [0, 60, 150], [60, 90, 30])
        expect(result).toEqual({ fileIndex: 0, localTimeSec: 30 })
    })

    it('should resolve to second file when absolute time crosses first file boundary', () => {
        const result = resolveAbsoluteTime(80, [0, 60, 150], [60, 90, 30])
        expect(result).toEqual({ fileIndex: 1, localTimeSec: 20 })
    })

    it('should resolve to last file for time near total end', () => {
        const result = resolveAbsoluteTime(160, [0, 60, 150], [60, 90, 30])
        expect(result).toEqual({ fileIndex: 2, localTimeSec: 10 })
    })

    it('should clamp to start for negative time', () => {
        const result = resolveAbsoluteTime(-5, [0, 60], [60, 90])
        expect(result).toEqual({ fileIndex: 0, localTimeSec: 0 })
    })

    it('should clamp to end of last file for time past total duration', () => {
        // Total duration = 60 + 90 = 150
        const result = resolveAbsoluteTime(200, [0, 60], [60, 90])
        expect(result).toEqual({ fileIndex: 1, localTimeSec: 90 })
    })

    it('should return fileIndex 0, localTimeSec 0 for empty arrays', () => {
        const result = resolveAbsoluteTime(10, [], [])
        expect(result).toEqual({ fileIndex: 0, localTimeSec: 0 })
    })

    it('should handle exact file boundary (start of second file)', () => {
        const result = resolveAbsoluteTime(60, [0, 60, 150], [60, 90, 30])
        expect(result).toEqual({ fileIndex: 1, localTimeSec: 0 })
    })
})

describe('absoluteTimeFromFilePosition', () => {
    it('should compute absolute time from file index and local time', () => {
        const result = absoluteTimeFromFilePosition(1, 20, [0, 60, 150])
        expect(result).toBe(80)
    })

    it('should return local time when file index is 0', () => {
        const result = absoluteTimeFromFilePosition(0, 30, [0, 60])
        expect(result).toBe(30)
    })

    it('should handle missing offset gracefully', () => {
        const result = absoluteTimeFromFilePosition(5, 10, [0, 60])
        expect(result).toBe(10)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/timelinePosition.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement timelinePosition.ts**

```ts
// src/utils/timelinePosition.ts

export type ResolvedPosition = {
    fileIndex: number
    localTimeSec: number
}

export function resolveAbsoluteTime(
    absoluteTimeSec: number,
    cumulativeOffsets: number[],
    fileDurations: number[],
): ResolvedPosition {
    if (cumulativeOffsets.length === 0 || fileDurations.length === 0) {
        return { fileIndex: 0, localTimeSec: 0 }
    }

    // Clamp to valid range
    const totalDuration = cumulativeOffsets[cumulativeOffsets.length - 1] + fileDurations[fileDurations.length - 1]
    const clamped = Math.max(0, Math.min(absoluteTimeSec, totalDuration))

    // Find which file this falls in
    for (let i = cumulativeOffsets.length - 1; i >= 0; i--) {
        if (clamped >= cumulativeOffsets[i]) {
            const localTime = clamped - cumulativeOffsets[i]
            // Clamp local time to file duration
            const clampedLocal = Math.min(localTime, fileDurations[i])
            return { fileIndex: i, localTimeSec: clampedLocal }
        }
    }

    return { fileIndex: 0, localTimeSec: 0 }
}

export function absoluteTimeFromFilePosition(
    fileIndex: number,
    localTimeSec: number,
    cumulativeOffsets: number[],
): number {
    const offset = cumulativeOffsets[fileIndex] ?? 0
    return offset + localTimeSec
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/timelinePosition.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/timelinePosition.ts src/utils/timelinePosition.test.ts
git commit -m "feat: add timelinePosition utils for absolute/relative time resolution"
```

---

## Task 5: Continuous Timeline Seeking + Auto-Advance

**Files:**
- Modify: `src/state.ts`
- Modify: `src/components/Player.tsx`

- [ ] **Step 1: Add seekToAbsolute action in state.ts**

Add to `AppState` type:

```ts
seekToAbsolute: (absoluteTimeSec: number) => void
```

Add implementation:

```ts
seekToAbsolute: (absoluteTimeSec) => {
    const state = get()
    const fileDurations = state.files.map(f => f.durationSec ?? 0)
    const { fileIndex, localTimeSec } = resolveAbsoluteTime(
        absoluteTimeSec,
        state.cumulativeOffsets,
        fileDurations,
    )
    // Use the seekToGoal custom event mechanism to handle file switching + seeking
    const event = new CustomEvent('seekToGoal', {
        detail: { fileIndex, timeSec: localTimeSec }
    })
    window.dispatchEvent(event)
},
```

Add import at top of file:

```ts
import { resolveAbsoluteTime } from './utils/timelinePosition'
```

- [ ] **Step 2: Add auto-advance overlay to Player.tsx**

In `src/components/Player.tsx`, add state for the overlay:

```tsx
const [showAdvanceOverlay, setShowAdvanceOverlay] = useState(false)
```

Update the `ended` event handler in the main `useEffect`:

```tsx
p.on('ended', () => {
    if (currentFileIndex < files.length - 1) {
        setShowAdvanceOverlay(true)
        setTimeout(() => {
            setShowAdvanceOverlay(false)
            setCurrentFileIndex(currentFileIndex + 1)
        }, 300)
    }
})
```

Add the overlay to the JSX, inside the player container div, after the `<video>` element:

```tsx
{showAdvanceOverlay && (
    <div className="absolute inset-0 flex items-center justify-center bg-deep/80 z-10 transition-opacity">
        <span className="text-sm font-bold text-muted">Loading next file...</span>
    </div>
)}
```

Also add `relative` to the player container's className so the absolute overlay positions correctly:

```tsx
<div ref={containerRef} className="player-container max-h-[50vh] overflow-hidden rounded-md relative">
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 4: Manual smoke test**

1. Load 2 videos
2. Seek to near end of first video — verify auto-advance shows overlay briefly then plays second file
3. In browser console: `useAppState.getState().seekToAbsolute(80)` with offsets [0, 60] — should seek to second file at 20s

- [ ] **Step 5: Commit**

```bash
git add src/state.ts src/components/Player.tsx
git commit -m "feat: continuous timeline seeking with seekToAbsolute and auto-advance overlay"
```

---

## Task 6: Expanded Timeline Visualisation

**Files:**
- Create: `src/components/Timeline.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create Timeline component**

```tsx
// src/components/Timeline.tsx
import { useRef, useMemo } from 'react'
import { useAppState } from '../state'
import { mergeOverlappingGoalSegments } from '../utils/highlights'
import { getEventColor } from '../utils/eventColors'
import { absoluteTimeFromFilePosition } from '../utils/timelinePosition'
import type { MatchEvent } from '../types'

export function Timeline() {
    const barRef = useRef<HTMLDivElement>(null)
    const files = useAppState((s) => s.files)
    const events = useAppState((s) => s.events)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const currentTimeInFileSec = useAppState((s) => s.currentTimeInFileSec)
    const matchStartTimeSec = useAppState((s) => s.matchStartTimeSec)
    const adjustTimestampsByOffset = useAppState((s) => s.adjustTimestampsByOffset)
    const lengthBeforeGoalSec = useAppState((s) => s.lengthBeforeGoalSec)
    const lengthAfterGoalSec = useAppState((s) => s.lengthAfterGoalSec)
    const seekToAbsolute = useAppState((s) => s.seekToAbsolute)

    const totalDuration = useMemo(() => {
        if (files.length === 0) return 0
        const lastOffset = cumulativeOffsets[cumulativeOffsets.length - 1] ?? 0
        const lastDuration = files[files.length - 1]?.durationSec ?? 0
        return lastOffset + lastDuration
    }, [files, cumulativeOffsets])

    const segments = useMemo(() => {
        return mergeOverlappingGoalSegments(
            events,
            cumulativeOffsets,
            matchStartTimeSec,
            adjustTimestampsByOffset,
            lengthBeforeGoalSec,
            lengthAfterGoalSec,
        )
    }, [events, cumulativeOffsets, matchStartTimeSec, adjustTimestampsByOffset, lengthBeforeGoalSec, lengthAfterGoalSec])

    const absoluteTime = useMemo(() => {
        return absoluteTimeFromFilePosition(currentFileIndex, currentTimeInFileSec, cumulativeOffsets)
    }, [currentFileIndex, currentTimeInFileSec, cumulativeOffsets])

    if (files.length === 0 || totalDuration === 0) return null

    const toPercent = (sec: number): number => (sec / totalDuration) * 100

    const onClick = (e: React.MouseEvent) => {
        if (!barRef.current) return
        const rect = barRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const fraction = Math.max(0, Math.min(1, x / rect.width))
        seekToAbsolute(fraction * totalDuration)
    }

    return (
        <div
            ref={barRef}
            onClick={onClick}
            className="relative w-full h-[60px] md:h-[70px] rounded bg-deep border border-border cursor-pointer overflow-hidden select-none"
            title="Click to seek"
        >
            {/* File regions */}
            {files.map((file, i) => {
                const offset = cumulativeOffsets[i] ?? 0
                const duration = file.durationSec ?? 0
                const left = toPercent(offset)
                const width = toPercent(duration)
                return (
                    <div
                        key={file.id}
                        className="absolute top-0 h-full border-r border-border/50"
                        style={{ left: `${left}%`, width: `${width}%` }}
                    >
                        <span className="absolute top-1 left-1.5 text-[9px] text-muted/50 font-semibold pointer-events-none">
                            {i + 1}
                        </span>
                    </div>
                )
            })}

            {/* Highlight segments (merged) */}
            {segments.map((seg, i) => {
                const segOffset = cumulativeOffsets[seg.sourceFileIndex] ?? 0
                const absStart = segOffset + Math.max(0, seg.startTime)
                const absEnd = segOffset + seg.endTime
                const left = toPercent(absStart)
                const width = toPercent(absEnd - absStart)
                return (
                    <div
                        key={`seg-${i}`}
                        className="absolute bottom-0 h-[40%] rounded-sm pointer-events-none"
                        style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            backgroundColor: 'rgba(247, 37, 133, 0.15)',
                            borderTop: '1px solid rgba(247, 37, 133, 0.3)',
                        }}
                    />
                )
            })}

            {/* Event markers */}
            {events.map((event) => {
                const offset = cumulativeOffsets[event.sourceFileIndex ?? 0] ?? 0
                const absTime = offset + event.matchTimeSec
                const left = toPercent(absTime)
                const color = getEventColor(event.type)
                return (
                    <div
                        key={event.id}
                        className="absolute top-[15%] h-[50%] w-[3px] rounded-full pointer-events-none"
                        style={{ left: `${left}%`, backgroundColor: color }}
                        title={`${event.type} at ${formatMMSS(event.matchTimeSec)}${event.team ? ` (${event.team})` : ''}${event.scorer ? ` ${event.scorer}` : ''}`}
                    />
                )
            })}

            {/* Playhead */}
            <div
                className="absolute top-0 h-full w-[2px] bg-light z-10 pointer-events-none"
                style={{ left: `${toPercent(absoluteTime)}%` }}
            >
                <div className="absolute -top-0.5 -left-[3px] w-[8px] h-[8px] bg-light rounded-full" />
            </div>
        </div>
    )
}

function formatMMSS(sec: number): string {
    const s = Math.max(0, Math.floor(sec))
    const mm = `${Math.floor(s / 60)}`.padStart(2, '0')
    const ss = `${s % 60}`.padStart(2, '0')
    return `${mm}:${ss}`
}
```

- [ ] **Step 2: Add Timeline to App.tsx**

Import the component:

```tsx
import { Timeline } from './components/Timeline'
```

Place it between the Player and AddGoalBar. Replace:

```tsx
{/* Add Goal Bar */}
<div className="mt-1.5 mb-4">
    <AddGoalBar />
</div>
```

With:

```tsx
{/* Timeline */}
<div className="mt-1.5">
    <Timeline />
</div>

{/* Add Goal Bar */}
<div className="mt-1.5 mb-4">
    <AddGoalBar />
</div>
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 4: Manual smoke test**

1. Load 2+ videos, add some events at various times
2. Verify timeline shows:
   - File regions with numbers
   - Coloured event markers at correct positions
   - Semi-transparent highlight segment blocks
   - Moving playhead during playback
3. Click on timeline — player should seek to that position (switching files if needed)
4. Verify mobile: timeline should be shorter (60px vs 70px) but still functional

- [ ] **Step 5: Commit**

```bash
git add src/components/Timeline.tsx src/App.tsx
git commit -m "feat: add expanded timeline visualisation with event markers, segments, and click-to-seek"
```

---

## Task 7: Event Type UI in AddGoalBar and GoalList

**Files:**
- Modify: `src/components/AddGoalBar.tsx`
- Modify: `src/components/GoalList.tsx`
- Modify: `src/components/OutputPanel.tsx`

- [ ] **Step 1: Add event type dropdown to AddGoalBar**

In `src/components/AddGoalBar.tsx`:

Add imports:

```tsx
import type { MatchEvent, EventType } from '../types'
import { EVENT_LABELS } from '../utils/eventColors'
```

Add state for event type:

```tsx
const [eventType, setEventType] = useState<EventType>('goal')
```

Add the type dropdown to the JSX, between the time input and team input:

```tsx
<select
    value={eventType}
    onChange={(e) => setEventType(e.target.value as EventType)}
    className="rounded bg-deep border border-border px-2 py-1.5 text-sm text-light focus:border-pink focus:outline-none"
>
    {Object.entries(EVENT_LABELS).map(([value, label]) => (
        <option key={value} value={value}>{label}</option>
    ))}
</select>
```

Update the `onAdd` function to include the type and conditionally include scorer:

```tsx
const onAdd = () => {
    const matchTimeSec = time ? parseTimeToSeconds(time) : Math.floor(currentTime)
    if (matchTimeSec == null) return
    const event: MatchEvent = {
        id: `${Date.now()}`,
        matchTimeSec,
        sourceFileIndex: currentFileIndex,
        type: eventType,
        team: team || undefined,
        scorer: eventType === 'goal' ? (scorer || undefined) : undefined,
    }
    addEvent(event)
    setTime('')
}
```

Conditionally show/hide scorer field based on type — show scorer for `goal`, show notes placeholder for other types:

```tsx
{eventType === 'goal' ? (
    <input
        placeholder="Scorer"
        value={scorer}
        onChange={(e) => setScorer(e.target.value)}
        className="w-[90px] rounded bg-deep border border-border px-2 py-1.5 text-sm text-light placeholder:text-muted focus:border-pink focus:outline-none hidden md:block"
    />
) : null}
```

Update the keyboard hint:

```tsx
<span className="ml-auto text-xs text-muted hidden md:inline">
    Press <kbd className="rounded bg-deep px-1.5 py-0.5 text-yellow font-bold text-[10px]">G</kbd> to mark goal
</span>
```

- [ ] **Step 2: Add coloured type indicator to GoalList rows**

In `src/components/GoalList.tsx`:

Add import:

```tsx
import { getEventColor, EVENT_LABELS } from '../utils/eventColors'
import type { MatchEvent, EventType } from '../types'
```

Update each event row to use the event type colour for the left border, and add a type indicator:

Replace the row className's `border-l-pink` with a dynamic style:

```tsx
<div
    key={g.id}
    className="flex items-center gap-2 rounded bg-deep border-l-[3px] px-2.5 py-2"
    style={{ borderLeftColor: getEventColor(g.type) }}
>
```

Add an inline type selector after the V1 badge:

```tsx
<select
    value={g.type}
    onChange={(e) => update(g.id, { type: e.target.value as EventType })}
    className="rounded bg-transparent border-none text-[10px] text-muted focus:outline-none p-0 cursor-pointer"
    style={{ color: getEventColor(g.type) }}
>
    {Object.entries(EVENT_LABELS).map(([value, label]) => (
        <option key={value} value={value}>{label}</option>
    ))}
</select>
```

- [ ] **Step 3: Add event type filter to OutputPanel**

In `src/components/OutputPanel.tsx`:

Add state for which event types to include in render/preview:

```tsx
import { useState } from 'react'
import type { EventType } from '../types'
import { EVENT_LABELS, EVENT_COLORS } from '../utils/eventColors'
```

```tsx
const [includedTypes, setIncludedTypes] = useState<Set<EventType>>(new Set(['goal']))
```

Add a multi-toggle above the Preview/Render buttons:

```tsx
<div className="flex flex-wrap gap-1 mb-2">
    <span className="text-[10px] text-muted w-full mb-0.5">Include in highlights:</span>
    {(Object.entries(EVENT_LABELS) as [EventType, string][]).map(([type, label]) => {
        const active = includedTypes.has(type)
        return (
            <button
                key={type}
                onClick={() => {
                    const next = new Set(includedTypes)
                    if (active) next.delete(type)
                    else next.add(type)
                    setIncludedTypes(next)
                }}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold border cursor-pointer transition-colors ${
                    active
                        ? 'text-deep border-transparent'
                        : 'text-muted border-border bg-transparent hover:border-muted'
                }`}
                style={active ? { backgroundColor: EVENT_COLORS[type] } : undefined}
            >
                {label}
            </button>
        )
    })}
</div>
```

Filter events before passing to PreviewControls and RenderHighlights. This requires a small refactor: the OutputPanel should filter `events` and pass the filtered list down. Since PreviewControls and RenderHighlights currently read from the store directly, the simplest approach is to store `includedEventTypes` in the Zustand store so both components can filter.

**Alternative (simpler):** Keep `includedTypes` as local state in OutputPanel and pass filtered events as props to PreviewControls and RenderHighlights. This requires adding a `filteredEvents` prop to both components.

Go with the prop approach:

In `PreviewControls.tsx`, add a prop:
```tsx
export function PreviewControls({ filteredEvents }: { filteredEvents?: MatchEvent[] }) {
```
Use `filteredEvents ?? events` for the count display. The actual preview uses `startPreview()` from the store, so we need to also pass filtered events there. The simplest path: add an `includedEventTypes` to the store that `startPreview` reads.

**Actually, the cleanest approach:** Add `includedEventTypes: Set<EventType>` and `setIncludedEventTypes` to the Zustand store. Then `startPreview` and `RenderHighlights` filter events using this. The OutputPanel toggles just call `setIncludedEventTypes`.

Add to `AppState` type in `state.ts`:

```ts
includedEventTypes: EventType[]
setIncludedEventTypes: (types: EventType[]) => void
```

Add to initial state:

```ts
includedEventTypes: ['goal'],
setIncludedEventTypes: (types) => set({ includedEventTypes: types }),
```

Update `startPreview` to filter:

```ts
startPreview: () => {
    const state = get()
    const filtered = state.events.filter(e => state.includedEventTypes.includes(e.type))
    const segments = mergeOverlappingGoalSegments(
        filtered,
        state.cumulativeOffsets,
        state.matchStartTimeSec,
        state.adjustTimestampsByOffset,
        state.lengthBeforeGoalSec,
        state.lengthAfterGoalSec
    )
    if (segments.length > 0) {
        set({
            isPreviewMode: true,
            previewSegments: segments,
            currentPreviewSegment: 0
        })
    }
},
```

Update `RenderHighlights.tsx` to filter:

```tsx
const includedEventTypes = useAppState((s) => s.includedEventTypes)
// ... in encodeToMP4:
const filteredEvents = events.filter(e => includedEventTypes.includes(e.type))
// Use filteredEvents instead of events in mergeOverlappingGoalSegments call
```

Add `includedEventTypes` to the `partialize` list so it persists.

Then in `OutputPanel.tsx`, read from store instead of local state:

```tsx
const includedEventTypes = useAppState((s) => s.includedEventTypes)
const setIncludedEventTypes = useAppState((s) => s.setIncludedEventTypes)
```

And the toggle becomes:

```tsx
onClick={() => {
    const current = includedEventTypes
    const next = current.includes(type)
        ? current.filter(t => t !== type)
        : [...current, type]
    setIncludedEventTypes(next)
}}
```

With `active = includedEventTypes.includes(type)`.

Update the score display in OutputPanel to only count events of type `goal`:

```tsx
const scoreCount = useMemo(() => {
    const teamCounts: Record<string, number> = {}
    events.filter(e => e.type === 'goal').forEach(event => {
        if (event.team) {
            teamCounts[event.team] = (teamCounts[event.team] || 0) + 1
        }
    })
    return teamCounts
}, [events])
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 5: Manual smoke test**

1. Add events of different types (goal, save, foul)
2. Verify GoalList shows different coloured left borders
3. Verify type dropdowns work in both AddGoalBar and GoalList rows
4. Toggle event type filters in Output panel
5. Preview with only goals selected — should skip non-goal events
6. Render with saves included — should include save events in output

- [ ] **Step 6: Commit**

```bash
git add src/components/AddGoalBar.tsx src/components/GoalList.tsx src/components/OutputPanel.tsx src/components/RenderHighlights.tsx src/state.ts
git commit -m "feat: event type UI — dropdown selectors, coloured indicators, and render/preview filtering"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Goal → MatchEvent rename + EventType + eventColors util | 17 files |
| 2 | Undo/redo for event mutations | 3 files |
| 3 | File reorder with event index remapping | 2 files |
| 4 | Timeline position utils | 2 files (new) |
| 5 | Continuous seeking + auto-advance | 2 files |
| 6 | Expanded timeline visualisation | 2 files (1 new) |
| 7 | Event type UI in AddGoalBar, GoalList, OutputPanel | 5 files |

Each task produces a working, testable app. Tasks 1–3 handle data model and state. Tasks 4–5 handle cross-file seeking infrastructure. Task 6 is the visual timeline. Task 7 wires up the event type UI that was enabled by the data model change in Task 1.
