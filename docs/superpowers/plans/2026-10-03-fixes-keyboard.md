# Fixes & Keyboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Events survive adding/removing/reordering files, faster keyboard navigation (1 s and frame steps), G-only goal key (M = mute), no click dead zones on the player, and no manual time-entry field.

**Architecture:** Events gain a durable `sourceFileKey`; a pure `relinkEvents()` recomputes `sourceFileIndex` after every file or event change in the Zustand store, marking events whose file is gone as `unlinked` rather than deleting them. Keyboard changes are videojs-hotkeys options backed by pure helpers. Spec: `docs/superpowers/specs/2026-10-03-fixes-keyboard-design.md`.

**Tech Stack:** React 19, TypeScript, Zustand 5, video.js 8 + videojs-hotkeys 0.2, Vitest 4 (+ happy-dom).

---

## Context for the implementer

- `MatchEvent.matchTimeSec` is seconds **within** `files[sourceFileIndex]`. Many places read `sourceFileIndex ?? 0`.
- Store: `src/state.ts` (Zustand + `persist`; only events and settings are persisted, never files).
- Sub-project B runs in parallel on `feat/gopro-import`. It adds `kind: 'full' | 'proxy'` (required) to `VideoSourceFile`. Build all test fixtures through a local `vf()` helper so the merge only needs `kind: 'full'` added in one place per test file.
- Tests: `npm run test:run`. Component tests need `// @vitest-environment happy-dom` on line 1.
- Commit after every task; end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | modify | `sourceFileKey`, `unlinked` on `MatchEvent` |
| `src/utils/fileKey.ts` | create | Stable key for a file name |
| `src/utils/relink.ts` | create | `relinkEvents`, `linkedEvents` |
| `src/utils/hotkeys.ts` | create | `seekStepFor`, `frameStepTime`, `DEFAULT_FPS` |
| `src/state.ts` | modify | `addFiles`, `moveFile`, relink in all mutators, `removeFile` keeps events, `startPreview` uses linked events |
| `src/components/FilePills.tsx` | modify | `addFiles`, `moveFile` |
| `src/components/EmptyPlayer.tsx` | modify | `addFiles`, shortcut hint |
| `src/components/GoalList.tsx` | modify | Unlinked display; `type` on bulk-paste events |
| `src/components/OutputPanel.tsx` | modify | Score counts from linked events |
| `src/components/AddGoalBar.tsx` | modify | Remove time input |
| `src/components/Player.tsx` | modify | Hotkey options, frame step, `type: 'goal'` |
| `src/components/FullscreenControls.tsx` | modify | `type: 'goal'` |
| `src/App.css` | modify | `pointer-events` fixes (Task 7) |
| `CLAUDE.md` | modify | Shortcut table |

---

### Task 0: Worktree

- [ ] **Step 1: Create worktree**

```bash
cd /Users/foundersfactory/code/shot-stopper
git worktree add ../shot-stopper-a -b feat/fixes-keyboard
cd ../shot-stopper-a
cp ../shot-stopper/localhost+2*.pem . 2>/dev/null || true
npm install
```

- [ ] **Step 2: Baseline**

Run: `npm run test:run`
Expected: `Tests  28 passed (28)`

---

### Task 1: Fix existing type errors

`npx tsc -b --noEmit` currently reports 5 errors, so `npm run build` fails.

**Files:**
- Modify: `src/components/Player.tsx:115-119`
- Modify: `src/components/FullscreenControls.tsx:101-107`
- Modify: `src/components/GoalList.tsx:210`
- Modify: `src/utils/eventColors.test.ts:2`
- Modify: `vite.config.ts:1-17`

- [ ] **Step 1: Confirm the errors**

Run: `npx tsc -b --noEmit 2>&1 | grep "error TS"`
Expected: 5 lines (Player, FullscreenControls, GoalList missing `type`; unused `EVENT_COLORS`; `UserConfig` not exported).

- [ ] **Step 2: Add `type: 'goal'`**

`Player.tsx` (inside the `addGoal` hotkey handler):

```ts
                                    addGoal({
                                        id: `${Date.now()}`,
                                        matchTimeSec: currentTimeSeconds,
                                        sourceFileIndex: currentIdx,
                                        type: 'goal',
                                    });
```

`FullscreenControls.tsx` (in `handleSubmitGoal`):

```ts
            const goal: Goal = {
                id: `${Date.now()}`,
                matchTimeSec: currentTimeSeconds,
                sourceFileIndex: currentFileIndex,
                type: 'goal',
                team: teamName || undefined,
                scorer: playerName || undefined
            }
```

`GoalList.tsx:210` (`parseLine` return):

```ts
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, matchTimeSec: seconds, team, scorer, sourceFileIndex: sourceIdx, type: 'goal' }
```

- [ ] **Step 3: Remove the unused import** in `src/utils/eventColors.test.ts` line 2 — delete `EVENT_COLORS` from the import list (keep the other names).

- [ ] **Step 4: Fix `vite.config.ts`**

Replace the first lines and the `satisfies`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  test: {
    // Use 'node' for utils (pure functions, no DOM needed).
    // Component tests should annotate with @vitest-environment happy-dom.
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'dist'],
  },
```

(rest of the file unchanged).

- [ ] **Step 5: Verify**

Run: `npx tsc -b --noEmit 2>&1 | grep -c "error TS"; npm run test:run`
Expected: `0`; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src vite.config.ts
git commit -m "fix: add missing event type and repair type-check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `fileKey`, `relinkEvents`, `linkedEvents`

**Files:**
- Modify: `src/types.ts` (`MatchEvent`)
- Create: `src/utils/fileKey.ts`, `src/utils/relink.ts`
- Test: `src/utils/fileKey.test.ts`, `src/utils/relink.test.ts`

- [ ] **Step 1: Extend `MatchEvent`** in `src/types.ts`

```ts
export type MatchEvent = {
    id: string
    matchTimeSec: number
    sourceFileIndex?: number
    sourceFileKey?: string   // durable link to the source file (see utils/fileKey.ts)
    unlinked?: boolean       // true when the source file is not currently loaded
    type: EventType
    team?: string
    scorer?: string
    notes?: string
}
```

- [ ] **Step 2: Write the failing tests**

`src/utils/fileKey.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fileKey } from './fileKey'

describe('fileKey', () => {
    it('should use the file name', () => {
        expect(fileKey('match-1.mp4')).toBe('match-1.mp4')
    })
})
```

`src/utils/relink.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { relinkEvents, linkedEvents } from './relink'
import type { MatchEvent } from '../types'

const files = (...names: string[]) => names.map((name) => ({ name }))
const ev = (id: string, extra: Partial<MatchEvent>): MatchEvent => ({ id, matchTimeSec: 10, type: 'goal', ...extra })

describe('relinkEvents', () => {
    it('should assign a key from the current index when the event has none', () => {
        const r = relinkEvents([ev('a', { sourceFileIndex: 1 })], files('one.mp4', 'two.mp4'))
        expect(r[0]).toMatchObject({ sourceFileIndex: 1, sourceFileKey: 'two.mp4' })
    })

    it('should treat a missing index as file 0 for legacy events', () => {
        const r = relinkEvents([ev('a', {})], files('one.mp4'))
        expect(r[0].sourceFileKey).toBe('one.mp4')
    })

    it('should leave keyless events alone when their file does not exist', () => {
        const e = ev('a', { sourceFileIndex: 3 })
        expect(relinkEvents([e], files('one.mp4'))[0]).toBe(e)
    })

    it('should follow the file when files are reordered', () => {
        const r = relinkEvents([ev('a', { sourceFileIndex: 0, sourceFileKey: 'one.mp4' })], files('two.mp4', 'one.mp4'))
        expect(r[0].sourceFileIndex).toBe(1)
    })

    it('should mark events unlinked when their file is removed, keeping the old index', () => {
        const r = relinkEvents([ev('a', { sourceFileIndex: 0, sourceFileKey: 'gone.mp4' })], files('one.mp4'))
        expect(r[0]).toMatchObject({ unlinked: true, sourceFileIndex: 0 })
    })

    it('should relink and clear unlinked when the file is added back', () => {
        const r = relinkEvents([ev('a', { sourceFileIndex: 0, sourceFileKey: 'back.mp4', unlinked: true })], files('one.mp4', 'back.mp4'))
        expect(r[0].sourceFileIndex).toBe(1)
        expect(r[0].unlinked).toBeUndefined()
    })

    it('should return the same object when nothing changes', () => {
        const e = ev('a', { sourceFileIndex: 0, sourceFileKey: 'one.mp4' })
        expect(relinkEvents([e], files('one.mp4'))[0]).toBe(e)
    })
})

describe('linkedEvents', () => {
    it('should drop unlinked events', () => {
        const r = linkedEvents([ev('a', {}), ev('b', { unlinked: true })])
        expect(r.map((e) => e.id)).toEqual(['a'])
    })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/utils/fileKey.test.ts src/utils/relink.test.ts`
Expected: FAIL — import errors

- [ ] **Step 4: Implement**

`src/utils/fileKey.ts`:

```ts
// Stable identity for a source file across sessions and list changes.
// After the GoPro import work merges this becomes `parseGoProName(name)?.key ?? name`
// so LRV proxies and their full MP4s share a key.
export function fileKey(name: string): string {
    return name
}
```

`src/utils/relink.ts`:

```ts
import type { MatchEvent } from '../types'
import { fileKey } from './fileKey'

export function relinkEvents(events: MatchEvent[], files: { name: string }[]): MatchEvent[] {
    const keys = files.map((f) => fileKey(f.name))
    return events.map((e) => {
        if (e.sourceFileKey === undefined) {
            const key = keys[e.sourceFileIndex ?? 0]
            return key === undefined ? e : { ...e, sourceFileKey: key }
        }
        const idx = keys.indexOf(e.sourceFileKey)
        if (idx === -1) return e.unlinked ? e : { ...e, unlinked: true }
        if (idx === e.sourceFileIndex && !e.unlinked) return e
        const next: MatchEvent = { ...e, sourceFileIndex: idx }
        delete next.unlinked
        return next
    })
}

export function linkedEvents(events: MatchEvent[]): MatchEvent[] {
    return events.filter((e) => !e.unlinked)
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/utils/fileKey.test.ts src/utils/relink.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/utils/fileKey.ts src/utils/fileKey.test.ts src/utils/relink.ts src/utils/relink.test.ts
git commit -m "feat: durable event-to-file links with relinkEvents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Store — append, move, remove without losing events

**Files:**
- Modify: `src/state.ts`
- Test: `src/state.test.ts` (create; if sub-project B already created it, append the `describe` blocks)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppState } from './state'
import type { MatchEvent, VideoSourceFile } from './types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 100 })
const goalIn = (fileIndex: number, id = `g${fileIndex}`): MatchEvent => ({ id, matchTimeSec: 10, sourceFileIndex: fileIndex, type: 'goal' })
const s = () => useAppState.getState()

describe('file changes keep events', () => {
    beforeEach(() => {
        useAppState.setState({ files: [], events: [], cumulativeOffsets: [], undoStack: [], redoStack: [], currentFileIndex: 0 })
        s().setFiles([vf('a.mp4'), vf('b.mp4')])
        s().addEvent(goalIn(0, 'ga'))
        s().addEvent(goalIn(1, 'gb'))
    })

    it('should stamp new events with their file key', () => {
        expect(s().events.map((e) => e.sourceFileKey)).toEqual(['a.mp4', 'b.mp4'])
    })

    it('should append files with addFiles and keep event links', () => {
        s().addFiles([vf('c.mp4')])
        expect(s().files.map((f) => f.name)).toEqual(['a.mp4', 'b.mp4', 'c.mp4'])
        expect(s().events.map((e) => e.sourceFileIndex)).toEqual([0, 1])
    })

    it('should keep events of a removed file as unlinked and shift later ones', () => {
        s().removeFile(0)
        const [ga, gb] = [s().events.find((e) => e.id === 'ga')!, s().events.find((e) => e.id === 'gb')!]
        expect(ga.unlinked).toBe(true)
        expect(gb).toMatchObject({ sourceFileIndex: 0 })
        expect(gb.unlinked).toBeUndefined()
    })

    it('should relink when a removed file is added back', () => {
        s().removeFile(0)
        s().addFiles([vf('a.mp4')])
        const ga = s().events.find((e) => e.id === 'ga')!
        expect(ga.unlinked).toBeUndefined()
        expect(ga.sourceFileIndex).toBe(1)
    })

    it('should move events with their file on reorder', () => {
        s().moveFile(0, 1)
        expect(s().files.map((f) => f.name)).toEqual(['b.mp4', 'a.mp4'])
        expect(s().events.find((e) => e.id === 'ga')!.sourceFileIndex).toBe(1)
        expect(s().events.find((e) => e.id === 'gb')!.sourceFileIndex).toBe(0)
    })

    it('should ignore out-of-range moves', () => {
        s().moveFile(0, -1)
        expect(s().files.map((f) => f.name)).toEqual(['a.mp4', 'b.mp4'])
    })

    it('should relink on undo', () => {
        // snapshot taken by addEvent has ga at index 0; the move happens after, so undo must relink
        s().addEvent(goalIn(0, 'gc'))
        s().moveFile(0, 1)
        s().undo()
        expect(s().events.find((e) => e.id === 'ga')!.sourceFileIndex).toBe(1)
    })

    it('should exclude unlinked events from preview segments', () => {
        s().removeFile(0)
        s().startPreview()
        expect(s().previewSegments.flatMap((seg) => seg.goals.map((g) => g.id))).toEqual(['gb'])
    })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/state.test.ts`
Expected: FAIL — `addFiles is not a function`, keys undefined, etc.

- [ ] **Step 3: Implement in `src/state.ts`**

Imports:

```ts
import { relinkEvents, linkedEvents } from './utils/relink'
```

`AppState` type — add:

```ts
    addFiles: (files: VideoSourceFile[]) => void
    moveFile: (from: number, to: number) => void
```

Replace `setFiles` and `removeFile`, and add `addFiles`/`moveFile`:

```ts
            setFiles: (files) => set({
                files,
                cumulativeOffsets: computeCumulativeOffsets(files),
                events: relinkEvents(get().events, files),
            }),
            addFiles: (added) => get().setFiles([...get().files, ...added]),
            moveFile: (from, to) => {
                const files = get().files
                if (to < 0 || to >= files.length || from === to) return
                const next = files.slice()
                const [moved] = next.splice(from, 1)
                next.splice(to, 0, moved)
                const cur = get().currentFileIndex
                get().setFiles(next)
                if (cur === from) set({ currentFileIndex: to })
            },
            removeFile: (index) => {
                const newFiles = get().files.filter((_, i) => i !== index)
                const newFileIndex = Math.min(get().currentFileIndex, newFiles.length - 1)
                set({
                    files: newFiles,
                    cumulativeOffsets: computeCumulativeOffsets(newFiles),
                    currentFileIndex: Math.max(0, newFileIndex),
                    events: relinkEvents(get().events, newFiles),
                })
            },
```

In `addEvent`, relink before sorting:

```ts
                const newEvents = relinkEvents([...prevEvents, event], state.files)
```

In `setEvents`:

```ts
                    events: relinkEvents(events, state.files),
```

In `undo` / `redo`, wrap the restored snapshot:

```ts
                    events: relinkEvents(previous, state.files),
```

```ts
                    events: relinkEvents(next, state.files),
```

In `startPreview`, pass linked events only:

```ts
                const segments = mergeOverlappingGoalSegments(
                    linkedEvents(state.events),
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm run test:run`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/state.ts src/state.test.ts
git commit -m "fix: keep events linked when files are added, removed or reordered

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wire components to the new store actions

**Files:**
- Modify: `src/components/FilePills.tsx:14,25,28-34,57,63`
- Modify: `src/components/EmptyPlayer.tsx:7,18`
- Modify: `src/components/OutputPanel.tsx:7-17`
- Modify: `src/components/GoalList.tsx:62-72,86-90`
- Test: `src/components/GoalList.test.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAppState } from '../state'
import { GoalList } from './GoalList'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 100 })

describe('GoalList', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')],
            events: [
                { id: 'linked', matchTimeSec: 10, sourceFileIndex: 0, sourceFileKey: 'a.mp4', type: 'goal' },
                { id: 'orphan', matchTimeSec: 20, sourceFileIndex: 1, sourceFileKey: 'gone.mp4', unlinked: true, type: 'goal' },
            ],
        })
    })

    it('should tag unlinked events as file missing and disable their seek button', () => {
        render(<GoalList />)
        expect(screen.getByText('V1')).toBeInTheDocument()
        expect(screen.getByText(/file missing/i)).toBeInTheDocument()
        const watch = screen.getAllByTitle(/watch goal|file not loaded/i)
        expect(watch[1]).toBeDisabled()
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/GoalList.test.tsx`
Expected: FAIL — no "file missing"

- [ ] **Step 3: Update `GoalList.tsx`**

Row container and file tag (replace the `<div key={g.id} …>` opening line and the `V{…}` span):

```tsx
                        <div key={g.id} className={`flex items-center gap-2 rounded bg-deep border-l-[3px] px-2.5 py-2 ${g.unlinked ? 'border-l-muted opacity-50' : 'border-l-pink'}`}>
```

```tsx
                            <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted" title={g.unlinked ? g.sourceFileKey : undefined}>
                                {g.unlinked ? 'file missing' : `V${(g.sourceFileIndex ?? 0) + 1}`}
                            </span>
```

Seek button:

```tsx
                                <button
                                    onClick={() => seekToGoal(g.sourceFileIndex ?? 0, Math.max(0, g.matchTimeSec - lengthBeforeGoalSec))}
                                    disabled={g.unlinked}
                                    className="text-xs text-muted hover:text-light bg-transparent border-none p-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={g.unlinked ? `File not loaded: ${g.sourceFileKey}` : `Watch goal (starts ${lengthBeforeGoalSec}s before)`}
                                >&#9654;</button>
```

- [ ] **Step 4: Update `FilePills.tsx`**

```tsx
    const addFiles = useAppState((s) => s.addFiles)
    const moveFile = useAppState((s) => s.moveFile)
```

(remove the `setFiles` selector and the local `move` function). In `onPick`:

```tsx
        if (result.files.length > 0) addFiles(result.files)
        evt.target.value = ''
```

Arrow buttons: `move(i, i - 1)` → `moveFile(i, i - 1)`, `move(i, i + 1)` → `moveFile(i, i + 1)`.

- [ ] **Step 5: Update `EmptyPlayer.tsx`**

```tsx
    const addFiles = useAppState((s) => s.addFiles)
```

and `if (result.files.length > 0) addFiles(result.files)`.

- [ ] **Step 6: Update `OutputPanel.tsx`** score counts:

```tsx
import { linkedEvents } from '../utils/relink'
// ...
    const goals = useAppState((s) => s.events)

    const scoreCount = useMemo(() => {
        const teamCounts: Record<string, number> = {}
        linkedEvents(goals).forEach(goal => {
```

- [ ] **Step 7: Run tests and lint**

Run: `npm run test:run && npm run lint`
Expected: all PASS, no new lint errors

- [ ] **Step 8: Commit**

```bash
git add src/components
git commit -m "feat: append files, follow reorders, show unlinked events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Remove manual time entry (#15)

**Files:**
- Modify: `src/components/AddGoalBar.tsx`
- Test: `src/components/AddGoalBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { AddGoalBar } from './AddGoalBar'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 100 })

describe('AddGoalBar', () => {
    beforeEach(() => {
        useAppState.setState({ files: [vf('a.mp4')], events: [], currentFileIndex: 0, currentTimeInFileSec: 42.7, undoStack: [], redoStack: [] })
    })

    it('should not offer a manual time field', () => {
        render(<AddGoalBar />)
        expect(screen.queryByPlaceholderText('00:42')).not.toBeInTheDocument()
    })

    it('should add a goal at the current playback time', async () => {
        render(<AddGoalBar />)
        await userEvent.click(screen.getByRole('button', { name: /\+ goal/i }))
        expect(useAppState.getState().events[0]).toMatchObject({ matchTimeSec: 42, sourceFileIndex: 0, type: 'goal' })
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/AddGoalBar.test.tsx`
Expected: FAIL on "should not offer a manual time field"

- [ ] **Step 3: Rewrite `AddGoalBar.tsx`**

```tsx
import { useState } from 'react'
import { useAppState } from '../state'
import type { MatchEvent } from '../types'
import { formatHMS } from '../utils/timeline'

export function AddGoalBar() {
    const currentTime = useAppState((s) => s.currentTimeInFileSec)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const addEvent = useAppState((s) => s.addEvent)
    const files = useAppState((s) => s.files)

    const [team, setTeam] = useState('')
    const [scorer, setScorer] = useState('')

    const onAdd = () => {
        const event: MatchEvent = {
            id: `${Date.now()}`,
            matchTimeSec: Math.floor(currentTime),
            sourceFileIndex: currentFileIndex,
            type: 'goal',
            team: team || undefined,
            scorer: scorer || undefined,
        }
        addEvent(event)
    }

    if (files.length === 0) return null

    return (
        <div className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 flex-wrap">
            <span className="w-[70px] text-sm font-semibold text-pink tabular-nums">{formatHMS(currentTime)}</span>
            <input
                placeholder="Team"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="w-[90px] rounded bg-deep border border-border px-2 py-1.5 text-sm text-light placeholder:text-muted focus:border-pink focus:outline-none hidden md:block"
            />
            <input
                placeholder="Scorer"
                value={scorer}
                onChange={(e) => setScorer(e.target.value)}
                className="w-[90px] rounded bg-deep border border-border px-2 py-1.5 text-sm text-light placeholder:text-muted focus:border-pink focus:outline-none hidden md:block"
            />
            <button
                onClick={onAdd}
                className="rounded bg-pink px-3 py-1.5 text-sm font-bold text-white border-none cursor-pointer hover:bg-pink/80 transition-colors"
            >
                + Goal
            </button>
            <span className="ml-auto text-xs text-muted hidden md:inline">
                Press <kbd className="rounded bg-deep px-1.5 py-0.5 text-yellow font-bold text-[10px]">G</kbd> while playing
            </span>
        </div>
    )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/AddGoalBar.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/AddGoalBar.tsx src/components/AddGoalBar.test.tsx
git commit -m "feat: remove manual time entry; + Goal always uses playback time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Keyboard (#19)

**Files:**
- Create: `src/utils/hotkeys.ts`
- Test: `src/utils/hotkeys.test.ts`
- Modify: `src/components/Player.tsx:42-51` (options) and custom keys
- Modify: `src/components/EmptyPlayer.tsx:48-57` (hint grid)
- Modify: `CLAUDE.md` (shortcut table)

- [ ] **Step 1: Confirm the option names exist**

Run: `grep -nE "muteKey: muteKey|volumeUpKey: volumeUpKey|volumeDownKey: volumeDownKey|typeof seekStep === \"function\"" node_modules/videojs-hotkeys/videojs.hotkeys.js`
Expected: 4 matches. (`muteKey` defaults to M. M currently mutes *and* adds a goal because the custom `addGoal` key also matches M; we keep M = mute and make `addGoal` G-only.)

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { seekStepFor, frameStepTime, DEFAULT_FPS } from './hotkeys'

describe('seekStepFor', () => {
    it('should seek 5 s normally and 1 s with Shift', () => {
        expect(seekStepFor({ shiftKey: false })).toBe(5)
        expect(seekStepFor({ shiftKey: true })).toBe(1)
    })
})

describe('frameStepTime', () => {
    it('should land in the middle of the next frame', () => {
        expect(frameStepTime(0, 1, 30)).toBeCloseTo(1.5 / 30)
        expect(frameStepTime(1.5 / 30, 1, 30)).toBeCloseTo(2.5 / 30)
    })

    it('should step back one frame', () => {
        expect(frameStepTime(2.5 / 30, -1, 30)).toBeCloseTo(1.5 / 30)
    })

    it('should clamp to 0 and duration', () => {
        expect(frameStepTime(0, -1, 30)).toBe(0)
        expect(frameStepTime(9.99, 1, 30, 10)).toBe(10)
    })

    it('should default to 29.97 fps', () => {
        expect(DEFAULT_FPS).toBeCloseTo(29.97, 2)
        expect(frameStepTime(0, 1)).toBeCloseTo(1.5 / DEFAULT_FPS)
    })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/utils/hotkeys.test.ts`
Expected: FAIL — import error

- [ ] **Step 4: Implement `src/utils/hotkeys.ts`**

```ts
export const DEFAULT_FPS = 30000 / 1001

export function seekStepFor(e: { shiftKey: boolean }): number {
    return e.shiftKey ? 1 : 5
}

// Targets the middle of the neighbouring frame so the browser shows exactly that frame.
export function frameStepTime(currentSec: number, direction: 1 | -1, fps: number = DEFAULT_FPS, durationSec: number = Infinity): number {
    const frame = Math.floor(currentSec * fps + 1e-6) + direction
    const t = (frame + 0.5) / fps
    return Math.min(Math.max(0, t), durationSec)
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/utils/hotkeys.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Wire into `Player.tsx`**

Import:

```ts
import { seekStepFor, frameStepTime, DEFAULT_FPS } from '../utils/hotkeys'
```

Replace the option block at the top of `.hotkeys({ … })`:

```ts
                        volumeStep: 0.1,
                        seekStep: seekStepFor,             // ←/→ 5 s, Shift+←/→ 1 s
                        volumeUpKey: () => false,          // ↑/↓ are frame steps (custom keys below)
                        volumeDownKey: () => false,
                        enableModifiersForNumbers: false,
                        enableVolumeScroll: false,
                        enableHoverScroll: false,
                        enableFullscreen: true,
                        alwaysCaptureHotkeys: true,
                        enableNumbers: false,              // 0–9 seek disabled (too easy to hit by accident)
```

Make the `addGoal` custom key G-only (M stays as video.js mute):

```ts
                                key: function (event: KeyboardEvent) {
                                    return event.which === 71; // G
                                },
```

Add two entries to `customKeys`:

```ts
                            frameForward: {
                                key: (event: KeyboardEvent) => event.which === 38, // ↑
                                handler: (player: any) => {
                                    player.pause()
                                    player.currentTime(frameStepTime(player.currentTime() || 0, 1, DEFAULT_FPS, player.duration() || Infinity))
                                }
                            },
                            frameBack: {
                                key: (event: KeyboardEvent) => event.which === 40, // ↓
                                handler: (player: any) => {
                                    player.pause()
                                    player.currentTime(frameStepTime(player.currentTime() || 0, -1, DEFAULT_FPS, player.duration() || Infinity))
                                }
                            },
```

- [ ] **Step 7: Update `EmptyPlayer.tsx` hint grid** — change the first row to G only:

```tsx
                <span><kbd className="text-light font-bold">G</kbd></span>
                <span>Mark goal</span>
```

and append after the `[ / ]` row:

```tsx
                <span><kbd className="text-light font-bold">⇧←</kbd> / <kbd className="text-light font-bold">⇧→</kbd></span>
                <span>Back / forward 1 s</span>
                <span><kbd className="text-light font-bold">↑</kbd> / <kbd className="text-light font-bold">↓</kbd></span>
                <span>Next / previous frame</span>
```

- [ ] **Step 8: Update `CLAUDE.md`** shortcut table rows:

```markdown
| **G** | Add goal at current playback time |
| **M** | Mute / unmute |
| **Left / Right** | Seek ±5 seconds |
| **Shift + Left / Right** | Seek ±1 second |
| **Up / Down** | Step one frame forward / back (pauses) |
| **[ / ]** | Previous / next file |
```

(replace the existing `| **G / M** | Add goal … |` row with the G and M rows above, and delete the `| **0–9** | Seek to 0%–90% of video |` row — number-key seek is disabled.)

Also in `src/components/GoalList.tsx`, the empty-state text: `Press <kbd …>G</kbd> or <kbd …>M</kbd> during playback` → `Press <kbd className="text-light font-bold">G</kbd> during playback`.

- [ ] **Step 9: Manual check**

`npm run dev`, load any MP4: Shift+→ advances 1 s; → advances 5 s; ↑ pauses and advances one frame (time display changes by ~0.033 s per press — check via the scrubber tooltip or `document.querySelector('video').currentTime` in the console); G adds a goal; M mutes and does **not** add a goal; 0 and 5 do **not** change `currentTime`.

- [ ] **Step 10: Run tests and lint; commit**

Run: `npm run test:run && npm run lint`
Expected: PASS

```bash
git add src/utils/hotkeys.ts src/utils/hotkeys.test.ts src/components/Player.tsx src/components/EmptyPlayer.tsx src/components/GoalList.tsx CLAUDE.md
git commit -m "feat: Shift+arrows seek 1s, Up/Down step frames, G-only goal key (M = mute)

Also disables the 0-9 number-key seek shortcuts (enableNumbers: false).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Click dead zones (#2)

Use superpowers:systematic-debugging. Do not change CSS before the grid shows which element is intercepting clicks.

**Files:** likely `src/App.css` and/or `src/components/Player.tsx` (determined by Step 2)

- [ ] **Step 1: Reproduce**

`npm run dev`, load an MP4, not fullscreen. Click at the four corners and edges of the picture (outside the control bar). Note which areas fail to toggle play/pause.

- [ ] **Step 2: Map what sits on top**

In the DevTools console:

```js
(() => {
  const r = document.querySelector('.player-container').getBoundingClientRect()
  const rows = []
  for (let y = 0.05; y < 0.9; y += 0.1) {
    const row = []
    for (let x = 0.05; x < 1; x += 0.1) {
      const el = document.elementFromPoint(r.left + x * r.width, r.top + y * r.height)
      row.push(el?.classList.contains('vjs-tech') ? '.' : (el?.className || el?.tagName || '?').toString().split(' ')[0])
    }
    rows.push(row.join(' | '))
  }
  console.log(rows.join('\n'))
})()
```

Expected (healthy): every cell `.` except the bottom row (control bar). Record the actual grid in the commit message body.

- [ ] **Step 3: Fix the interceptors**

For each non-`.` element found that is not meant to be clickable, add `pointer-events: none` to it (and `pointer-events: auto` to any interactive children). Typical suspects in this codebase:
- `.fullscreen-overlay--normal` children in `src/App.css` (rules near lines 57, 100, 167 set `pointer-events: auto`)
- the status line `<div className="mt-1 px-1 text-xs">` inside `.player-container` in `Player.tsx` (it sits inside the clipped `aspect-video` box)
- `.vjs-big-play-button` / `.vjs-text-track-display` / `.vjs-poster` from video.js

If the interceptor is a video.js element that should forward clicks (e.g. `.vjs-poster`), prefer `pointer-events: none` on it over adding click handlers.

- [ ] **Step 4: Verify**

Re-run the Step 2 snippet: all cells `.` except the control bar row. Click each corner: play/pause toggles. Enter and exit fullscreen; confirm fullscreen overlay buttons still work.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "fix: remove click dead zones over the player

<paste before/after grids here>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Final verification

- [ ] **Step 1:** Run `npm run test:run && npm run lint && npm run build`
Expected: all tests PASS, lint clean, build succeeds (it failed before Task 1).

- [ ] **Step 2:** Manual regression: load 2 files, mark 2 events in each, click **+ Add file** to add a third — all 4 events keep their `V#`. Remove file 1 — its events show "file missing", file 2's events now show `V1`. Add file 1 back — its events relink. Reorder with ↑/↓ — tags follow. Refresh the page and reload the files in a different order — events attach to the right files.

---

## Merge notes (for whoever merges A and B second)

1. `src/utils/fileKey.ts` → `return parseGoProName(name)?.key ?? name` (import from `./gopro`); add a test: `fileKey('GL010226.LRV') === fileKey('GX010226.MP4')`.
2. `src/components/RenderHighlights.tsx` (B's rewrite) → pass `linkedEvents(events)` into `mergeOverlappingGoalSegments`.
3. Test fixtures `vf()` in `src/state.test.ts`, `GoalList.test.tsx`, `AddGoalBar.test.tsx` → add `kind: 'full'`.
4. `FilePills.tsx`: keep A's `addFiles`/`moveFile` and B's `accept`/badges.
5. `src/state.test.ts`: both branches add `describe` blocks; keep both.
