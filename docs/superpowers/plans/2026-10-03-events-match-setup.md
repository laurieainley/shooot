# Events & Match Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-key event marking (G) with a fast type → team → scorer picker, match setup (teams, rosters, start), scrubber markers, a working fullscreen container, and event-aware YouTube chapters.

**Architecture:** All decision logic is pure and unit-tested: event-type metadata (`eventTypes.ts`), the picker state machine (`eventPicker.ts`), roster/team helpers (`roster.ts`), marker placement (`markers.ts`). Components only render state and apply reducer effects to the Zustand store. Spec: `docs/superpowers/specs/2026-10-03-events-match-setup-design.md`.

**Tech Stack:** React 19, TypeScript, Zustand 5 (persist v9), video.js 8 + videojs-hotkeys, Vitest 4 (+ happy-dom), Tailwind 4.

---

## Context for the implementer

- Work in worktree `../shot-stopper-c`, branch `feat/events-match-setup`, created from `main` (which includes sub-project A).
- `MatchEvent.matchTimeSec` = seconds within `files[sourceFileIndex]`. `matchStartTimeSec` = seconds on the **global** timeline (sum of earlier file durations via `cumulativeOffsets`).
- A added `relinkEvents`/`linkedEvents` (`src/utils/relink.ts`); always use `linkedEvents(events)` for anything shown on the timeline, scored, or exported as chapters.
- Sub-project E (slow-mo) and B (GoPro import) run on other branches. **Do not edit** `src/components/RenderHighlights.tsx`, `src/components/FilePills.tsx`, `src/utils/highlights.ts`, `src/utils/probe.ts`, `src/utils/processFiles.ts`.
- `src/test/setup.ts` installs an in-memory `localStorage` (needed by Zustand persist under Node 22+).
- Commit after every task; end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Component tests: `// @vitest-environment happy-dom` on line 1.

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | modify | New `EventType`, `pen`, `Team` |
| `src/utils/eventTypes.ts` | create | Type metadata, picker options, labels, `isScoring`, `migrateEvent` |
| `src/utils/eventColors.ts` (+test) | delete | Superseded by `eventTypes.ts` (unused outside its test) |
| `src/utils/roster.ts` | create | `parseRoster`, `filterRoster`, `teamShortcuts` |
| `src/utils/eventPicker.ts` | create | Pure picker reducer |
| `src/utils/markers.ts` | create | `markersForFile`, `startInFile`, `homeTarget` |
| `src/utils/timeline.ts` | modify | Add `parseTimeToSeconds` (moved from components) |
| `src/utils/chapters.ts` | modify | Event labels, scoring-only score, team order |
| `src/state.ts` | modify | `teams`, `picker`, `markEvent`, `setTeams`, `renameTeam`, `addToRoster`, `openPicker`, `closePicker`; persist v9 |
| `src/components/TimeInput.tsx` | create | Shared time field (was duplicated in ClipSettings and GoalList) |
| `src/components/EventPicker.tsx` | create | Picker UI (popover / mobile sheet) |
| `src/components/MatchSetup.tsx` | create | Teams, rosters, match start |
| `src/components/TimelineMarkers.tsx` | create | Portal markers into the progress bar |
| `src/components/ChaptersCopy.tsx` | create | Copy YouTube / highlight chapters |
| `src/components/fullscreen.ts` | create | Container fullscreen patch for video.js |
| `src/components/Player.tsx` | modify | G → `markEvent`, Home, markers, picker, fullscreen patch, duration |
| `src/components/FullscreenControls.tsx` | modify | Goal button → `markEvent`; remove modal |
| `src/components/AddGoalBar.tsx` | modify | Time + "+ Event (G)" only |
| `src/components/GoalList.tsx` | modify | Type chip; use shared TimeInput / parser |
| `src/components/ClipSettings.tsx` | modify | Match start moves to MatchSetup; use shared parser |
| `src/components/OutputPanel.tsx` | modify | Scoring-only score in team order; ChaptersCopy |
| `src/App.tsx` | modify | Match button; export/import teams + `migrateEvent` |
| `src/App.css` | modify | Picker, markers, fullscreen container styles |

---

### Task 0: Worktree

- [ ] **Step 1**

```bash
cd /Users/foundersfactory/code/shot-stopper
git worktree add ../shot-stopper-c -b feat/events-match-setup main
cd ../shot-stopper-c
cp ../shot-stopper/localhost+2*.pem . 2>/dev/null || true
npm install
npm run test:run
```

Expected: `Tests  55 passed (55)`

---

### Task 1: Event types and metadata

**Files:**
- Modify: `src/types.ts`
- Create: `src/utils/eventTypes.ts`, `src/utils/eventTypes.test.ts`
- Delete: `src/utils/eventColors.ts`, `src/utils/eventColors.test.ts`

- [ ] **Step 1: Update types** in `src/types.ts`

```ts
export type EventType =
    | 'goal' | 'own_goal'
    | 'penalty_awarded' | 'penalty_missed'
    | 'highlight' | 'foul' | 'save'

export type MatchEvent = {
    id: string
    matchTimeSec: number
    sourceFileIndex?: number
    sourceFileKey?: string   // durable link to the source file (see utils/fileKey.ts)
    unlinked?: boolean       // true when the source file is not currently loaded
    type: EventType
    pen?: boolean            // goal scored from a penalty
    team?: string            // scoring events: the team credited with the goal
    scorer?: string          // own goal: player from the other team
    notes?: string
}

export type Team = {
    name: string
    color: string
    roster: string[]
}
```

- [ ] **Step 2: Write the failing test** `src/utils/eventTypes.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { PICKER_OPTIONS, eventLabel, eventIcon, isScoring, migrateEvent, optionForKey, EVENT_META } from './eventTypes'
import type { MatchEvent } from '../types'

const ev = (extra: Partial<MatchEvent>): MatchEvent => ({ id: 'e', matchTimeSec: 1, type: 'goal', ...extra })

describe('PICKER_OPTIONS', () => {
    it('should list goal first and give every option a unique key', () => {
        expect(PICKER_OPTIONS[0].id).toBe('goal')
        const keys = PICKER_OPTIONS.map((o) => o.key)
        expect(new Set(keys).size).toBe(keys.length)
        expect(keys).toEqual(['g', 'p', 'o', 'a', 'x', 'h', 'f', 's'])
    })
})

describe('optionForKey', () => {
    it('should find options case-insensitively', () => {
        expect(optionForKey('H')?.id).toBe('highlight')
        expect(optionForKey('p')?.id).toBe('goal_pen')
        expect(optionForKey('z')).toBeUndefined()
    })
})

describe('eventLabel', () => {
    it('should label penalty goals as Goal (pen)', () => {
        expect(eventLabel(ev({ pen: true }))).toBe('Goal (pen)')
        expect(eventLabel(ev({}))).toBe('Goal')
        expect(eventLabel(ev({ type: 'penalty_missed' }))).toBe('Penalty missed')
    })
})

describe('eventIcon', () => {
    it('should return an icon for every type', () => {
        for (const t of Object.keys(EVENT_META)) expect(eventIcon(ev({ type: t as MatchEvent['type'] }))).not.toBe('')
    })
})

describe('isScoring', () => {
    it('should count goals and own goals only', () => {
        expect(isScoring(ev({}))).toBe(true)
        expect(isScoring(ev({ type: 'own_goal' }))).toBe(true)
        expect(isScoring(ev({ type: 'penalty_awarded' }))).toBe(false)
        expect(isScoring(ev({ type: 'highlight' }))).toBe(false)
    })
})

describe('migrateEvent', () => {
    it('should map legacy types and default missing type to goal', () => {
        expect(migrateEvent({ id: 'a', matchTimeSec: 1, type: 'moment' }).type).toBe('highlight')
        expect(migrateEvent({ id: 'a', matchTimeSec: 1, type: 'card' }).type).toBe('foul')
        expect(migrateEvent({ id: 'a', matchTimeSec: 1 }).type).toBe('goal')
        expect(migrateEvent({ id: 'a', matchTimeSec: 1, type: 'save' }).type).toBe('save')
    })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/utils/eventTypes.test.ts`
Expected: FAIL — import error

- [ ] **Step 4: Implement** `src/utils/eventTypes.ts`

```ts
import type { EventType, MatchEvent } from '../types'

export type EventMeta = {
    label: string
    icon: string
    color: string
    scoring: boolean
}

export const EVENT_META: Record<EventType, EventMeta> = {
    goal:            { label: 'Goal',            icon: '⚽', color: '#f72585', scoring: true },
    own_goal:        { label: 'Own goal',        icon: '⚽', color: '#e63946', scoring: true },
    penalty_awarded: { label: 'Penalty awarded', icon: 'Ⓟ', color: '#fee440', scoring: false },
    penalty_missed:  { label: 'Penalty missed',  icon: 'Ⓟ', color: '#a0a0a0', scoring: false },
    highlight:       { label: 'Highlight',       icon: '★', color: '#4cc9f0', scoring: false },
    foul:            { label: 'Foul',            icon: '🟨', color: '#f4a261', scoring: false },
    save:            { label: 'Save',            icon: '🧤', color: '#4cc9f0', scoring: false },
}

export type PickerOptionId = 'goal' | 'goal_pen' | 'own_goal' | 'penalty_awarded' | 'penalty_missed' | 'highlight' | 'foul' | 'save'

export type PickerOption = {
    id: PickerOptionId
    type: EventType
    pen: boolean
    key: string          // lower-case shortcut in the picker
    label: string
    askTeam: boolean
    askScorer: boolean
}

export const PICKER_OPTIONS: PickerOption[] = [
    { id: 'goal',            type: 'goal',            pen: false, key: 'g', label: 'Goal',            askTeam: true,  askScorer: true },
    { id: 'goal_pen',        type: 'goal',            pen: true,  key: 'p', label: 'Goal (pen)',      askTeam: true,  askScorer: true },
    { id: 'own_goal',        type: 'own_goal',        pen: false, key: 'o', label: 'Own goal',        askTeam: true,  askScorer: true },
    { id: 'penalty_awarded', type: 'penalty_awarded', pen: false, key: 'a', label: 'Penalty awarded', askTeam: true,  askScorer: false },
    { id: 'penalty_missed',  type: 'penalty_missed',  pen: false, key: 'x', label: 'Penalty missed',  askTeam: true,  askScorer: true },
    { id: 'highlight',       type: 'highlight',       pen: false, key: 'h', label: 'Highlight',       askTeam: false, askScorer: false },
    { id: 'foul',            type: 'foul',            pen: false, key: 'f', label: 'Foul',            askTeam: false, askScorer: false },
    { id: 'save',            type: 'save',            pen: false, key: 's', label: 'Save',            askTeam: true,  askScorer: true },
]

export function optionForKey(key: string): PickerOption | undefined {
    const k = key.toLowerCase()
    return PICKER_OPTIONS.find((o) => o.key === k)
}

export function eventLabel(e: Pick<MatchEvent, 'type' | 'pen'>): string {
    return e.type === 'goal' && e.pen ? 'Goal (pen)' : EVENT_META[e.type].label
}

export function eventIcon(e: Pick<MatchEvent, 'type'>): string {
    return EVENT_META[e.type].icon
}

export function isScoring(e: Pick<MatchEvent, 'type'>): boolean {
    return EVENT_META[e.type].scoring
}

const LEGACY_TYPES: Record<string, EventType> = { moment: 'highlight', card: 'foul' }

export function migrateEvent(raw: Omit<MatchEvent, 'type'> & { type?: string }): MatchEvent {
    const t = raw.type ?? 'goal'
    const type = (LEGACY_TYPES[t] ?? (t in EVENT_META ? t : 'highlight')) as EventType
    return { ...raw, type }
}
```

- [ ] **Step 5: Delete the superseded module**

```bash
git rm src/utils/eventColors.ts src/utils/eventColors.test.ts
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src/utils/eventTypes.test.ts && npx tsc -b --noEmit 2>&1 | grep "error TS"`
Expected: tests PASS. Type errors may appear only where old types `'moment'`/`'card'` are referenced in `src/state.ts` migration (none expected). Fix any by using `migrateEvent`.

- [ ] **Step 7: Commit**

```bash
git add -A src/types.ts src/utils
git commit -m "feat: event types (own goal, penalties, highlight, foul, save) with metadata

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Roster and team helpers

**Files:**
- Create: `src/utils/roster.ts`, `src/utils/roster.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { parseRoster, filterRoster, teamShortcuts } from './roster'

describe('parseRoster', () => {
    it('should split on newlines and commas, strip list markers, trim and de-dupe', () => {
        const text = '1. Sam Taylor\n- Jo Bloggs\n• Alex Wu, sam taylor\n\n  Priya  \n2) Chris'
        expect(parseRoster(text)).toEqual(['Sam Taylor', 'Jo Bloggs', 'Alex Wu', 'Priya', 'Chris'])
    })
})

describe('filterRoster', () => {
    const roster = ['Sam Taylor', 'Sandy Wu', 'Alex Samson', 'Jo']
    it('should return everything for an empty query', () => {
        expect(filterRoster(roster, '')).toEqual(roster)
    })
    it('should match any word prefix, case-insensitively, keeping roster order', () => {
        expect(filterRoster(roster, 'sa')).toEqual(['Sam Taylor', 'Sandy Wu', 'Alex Samson'])
        expect(filterRoster(roster, 'WU')).toEqual(['Sandy Wu'])
        expect(filterRoster(roster, 'sam t')).toEqual(['Sam Taylor'])
    })
})

describe('teamShortcuts', () => {
    it('should use first letters when they differ', () => {
        expect(teamShortcuts(['Whites', 'Colours'])).toEqual(['w', 'c'])
    })
    it('should use the first differing position when first letters clash', () => {
        expect(teamShortcuts(['Reds', 'Rovers'])).toEqual(['e', 'o'])
    })
    it('should fall back to 1/2 for identical names', () => {
        expect(teamShortcuts(['Team', 'team'])).toEqual(['1', '2'])
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/roster.test.ts`
Expected: FAIL — import error

- [ ] **Step 3: Implement** `src/utils/roster.ts`

```ts
const LIST_MARKER = /^\s*(?:\d+[.)]|[-•*])\s*/

export function parseRoster(text: string): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const part of text.split(/[\n,]/)) {
        const name = part.replace(LIST_MARKER, '').trim().replace(/\s+/g, ' ')
        const k = name.toLowerCase()
        if (!name || seen.has(k)) continue
        seen.add(k)
        out.push(name)
    }
    return out
}

export function filterRoster(roster: string[], query: string): string[] {
    const q = query.trim().toLowerCase()
    if (!q) return roster
    return roster.filter((name) => {
        const n = name.toLowerCase()
        return n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q))
    })
}

export function teamShortcuts(names: string[]): string[] {
    const lower = names.map((n) => n.trim().toLowerCase())
    const firsts = lower.map((n) => n[0] ?? '')
    if (new Set(firsts).size === firsts.length && firsts.every(Boolean)) return firsts
    const len = Math.min(...lower.map((n) => n.length))
    for (let i = 1; i < len; i++) {
        const chars = lower.map((n) => n[i])
        if (new Set(chars).size === chars.length) return chars
    }
    return names.map((_, i) => String(i + 1))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/roster.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/roster.ts src/utils/roster.test.ts
git commit -m "feat: roster parsing, filtering and team shortcut letters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Picker reducer

**Files:**
- Create: `src/utils/eventPicker.ts`, `src/utils/eventPicker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { pickerReducer, initialPickerState, scorerCandidates, type PickerState, type PickerInput, type PickerContext } from './eventPicker'
import type { Team } from '../types'

const teams: Team[] = [
    { name: 'Whites', color: '#fff', roster: ['Sam Taylor', 'Sandy Wu'] },
    { name: 'Colours', color: '#f00', roster: ['Alex Wu', 'Jo'] },
]
const ctx: PickerContext = { teams }
const noTeams: PickerContext = { teams: [] }
const key = (k: string): PickerInput => ({ kind: 'key', key: k })

function run(inputs: PickerInput[], c: PickerContext = ctx) {
    let state: PickerState = initialPickerState
    const effects = []
    for (const i of inputs) {
        const r = pickerReducer(state, i, c)
        state = r.state
        effects.push(...r.effects)
    }
    return { state, effects }
}

describe('pickerReducer — type step', () => {
    it('should keep goal and move to team on Enter', () => {
        const r = run([key('Enter')])
        expect(r.effects).toEqual([{ kind: 'update', patch: { type: 'goal', pen: undefined } }])
        expect(r.state.step).toBe('team')
    })

    it('should select by letter (G confirms goal)', () => {
        expect(run([key('g')]).state.step).toBe('team')
        const h = run([key('h')])
        expect(h.effects).toEqual([{ kind: 'update', patch: { type: 'highlight', pen: undefined } }, { kind: 'close' }])
    })

    it('should mark penalty goals with pen', () => {
        expect(run([key('p')]).effects[0]).toEqual({ kind: 'update', patch: { type: 'goal', pen: true } })
    })

    it('should move the highlight with arrows and wrap', () => {
        expect(run([key('ArrowDown'), key('ArrowDown')]).state.highlighted).toBe(2)
        expect(run([key('ArrowUp')]).state.highlighted).toBe(7)
        expect(run([key('ArrowDown'), key('Enter')]).effects[0]).toEqual({ kind: 'update', patch: { type: 'goal', pen: true } })
    })

    it('should close on Escape and delete on Backspace', () => {
        expect(run([key('Escape')]).effects).toEqual([{ kind: 'close' }])
        expect(run([key('Backspace')]).effects).toEqual([{ kind: 'remove' }, { kind: 'close' }])
    })

    it('should close after type when no teams are configured', () => {
        expect(run([key('Enter')], noTeams).effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should ignore unknown keys', () => {
        expect(run([key('z')]).effects).toEqual([])
    })
})

describe('pickerReducer — team step', () => {
    it('should choose a team by shortcut letter', () => {
        const r = run([key('Enter'), key('c')])
        expect(r.effects.at(-1)).toEqual({ kind: 'update', patch: { team: 'Colours' } })
        expect(r.state).toMatchObject({ step: 'scorer', team: 'Colours' })
    })

    it('should choose the highlighted team on Enter', () => {
        const r = run([key('Enter'), key('ArrowDown'), key('Enter')])
        expect(r.state.team).toBe('Colours')
    })

    it('should close after team when the option has no scorer', () => {
        const r = run([key('a'), key('w')])
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should close on Escape', () => {
        expect(run([key('Enter'), key('Escape')]).effects.at(-1)).toEqual({ kind: 'close' })
    })
})

describe('pickerReducer — scorer step', () => {
    it('should filter by typed text and pick the highlighted match', () => {
        const r = run([key('Enter'), key('w'), { kind: 'text', value: 'sa' }, key('ArrowDown'), key('Enter')])
        expect(r.effects.slice(-2)).toEqual([{ kind: 'update', patch: { scorer: 'Sandy Wu' } }, { kind: 'close' }])
    })

    it('should add an unknown name to the roster', () => {
        const r = run([key('Enter'), key('w'), { kind: 'text', value: 'New Guy' }, key('Enter')])
        expect(r.effects.slice(-3)).toEqual([
            { kind: 'addToRoster', team: 'Whites', name: 'New Guy' },
            { kind: 'update', patch: { scorer: 'New Guy' } },
            { kind: 'close' },
        ])
    })

    it('should use the other team roster for own goals', () => {
        const r = run([key('o'), key('w')])
        expect(scorerCandidates(r.state, ctx)).toEqual(['Alex Wu', 'Jo'])
        const added = run([key('o'), key('w'), { kind: 'text', value: 'Zed' }, key('Enter')])
        expect(added.effects).toContainEqual({ kind: 'addToRoster', team: 'Colours', name: 'Zed' })
    })

    it('should ignore letter keys (they go to the text field) and close on Escape', () => {
        const r = run([key('Enter'), key('w'), key('h')])
        expect(r.state.step).toBe('scorer')
        expect(run([key('Enter'), key('w'), key('Escape')]).effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should close without a scorer on Enter with empty text and no roster', () => {
        const empty: PickerContext = { teams: [{ ...teams[0], roster: [] }, teams[1]] }
        const r = run([key('Enter'), key('w'), key('Enter')], empty)
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
        expect(r.effects).not.toContainEqual(expect.objectContaining({ kind: 'addToRoster' }))
    })
})

describe('pickerReducer — choose (tap/click)', () => {
    it('should accept option ids, team names and scorer names', () => {
        const r = run([
            { kind: 'choose', value: 'own_goal' },
            { kind: 'choose', value: 'Whites' },
            { kind: 'choose', value: 'Jo' },
        ])
        expect(r.effects).toEqual([
            { kind: 'update', patch: { type: 'own_goal', pen: undefined } },
            { kind: 'update', patch: { team: 'Whites' } },
            { kind: 'update', patch: { scorer: 'Jo' } },
            { kind: 'close' },
        ])
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/eventPicker.test.ts`
Expected: FAIL — import error

- [ ] **Step 3: Implement** `src/utils/eventPicker.ts`

```ts
import type { MatchEvent, Team } from '../types'
import { PICKER_OPTIONS, optionForKey, type PickerOption } from './eventTypes'
import { filterRoster, teamShortcuts } from './roster'

export type PickerStep = 'type' | 'team' | 'scorer'

export type PickerState = {
    step: PickerStep
    highlighted: number
    query: string
    option: PickerOption
    team?: string
}

export type PickerInput =
    | { kind: 'key'; key: string }
    | { kind: 'choose'; value: string }
    | { kind: 'text'; value: string }

export type PickerEffect =
    | { kind: 'update'; patch: Partial<MatchEvent> }
    | { kind: 'remove' }
    | { kind: 'addToRoster'; team: string; name: string }
    | { kind: 'close' }

export type PickerContext = { teams: Team[] }

type Result = { state: PickerState; effects: PickerEffect[] }

export const initialPickerState: PickerState = { step: 'type', highlighted: 0, query: '', option: PICKER_OPTIONS[0] }

const CLOSE: PickerEffect = { kind: 'close' }

function hasTeams(ctx: PickerContext): boolean {
    return ctx.teams.length >= 2 && ctx.teams.every((t) => t.name.trim() !== '')
}

function rosterTeam(state: PickerState, ctx: PickerContext): Team | undefined {
    const idx = ctx.teams.findIndex((t) => t.name === state.team)
    if (idx === -1) return undefined
    return state.option.type === 'own_goal' ? ctx.teams[1 - idx] : ctx.teams[idx]
}

export function scorerCandidates(state: PickerState, ctx: PickerContext): string[] {
    return filterRoster(rosterTeam(state, ctx)?.roster ?? [], state.query)
}

function wrap(i: number, n: number): number {
    return n === 0 ? 0 : (i + n) % n
}

function chooseOption(state: PickerState, option: PickerOption, ctx: PickerContext): Result {
    const effects: PickerEffect[] = [{ kind: 'update', patch: { type: option.type, pen: option.pen ? true : undefined } }]
    if (option.askTeam && hasTeams(ctx)) {
        return { state: { ...state, option, step: 'team', highlighted: 0, query: '' }, effects }
    }
    return { state: { ...state, option }, effects: [...effects, CLOSE] }
}

function chooseTeam(state: PickerState, team: string): Result {
    const effects: PickerEffect[] = [{ kind: 'update', patch: { team } }]
    if (state.option.askScorer) {
        return { state: { ...state, team, step: 'scorer', highlighted: 0, query: '' }, effects }
    }
    return { state: { ...state, team }, effects: [...effects, CLOSE] }
}

function chooseScorer(state: PickerState, name: string, ctx: PickerContext): Result {
    const roster = rosterTeam(state, ctx)
    const known = roster?.roster.some((r) => r.toLowerCase() === name.toLowerCase()) ?? false
    const effects: PickerEffect[] = []
    if (!known && roster) effects.push({ kind: 'addToRoster', team: roster.name, name })
    effects.push({ kind: 'update', patch: { scorer: name } }, CLOSE)
    return { state, effects }
}

export function pickerReducer(state: PickerState, input: PickerInput, ctx: PickerContext): Result {
    const none: Result = { state, effects: [] }

    if (input.kind === 'text') {
        return state.step === 'scorer' ? { state: { ...state, query: input.value, highlighted: 0 }, effects: [] } : none
    }

    if (input.kind === 'choose') {
        if (state.step === 'type') {
            const option = PICKER_OPTIONS.find((o) => o.id === input.value)
            return option ? chooseOption(state, option, ctx) : none
        }
        if (state.step === 'team') return chooseTeam(state, input.value)
        return chooseScorer(state, input.value, ctx)
    }

    const k = input.key
    if (k === 'Escape') return { state, effects: [CLOSE] }

    if (state.step === 'type') {
        const n = PICKER_OPTIONS.length
        if (k === 'Backspace') return { state, effects: [{ kind: 'remove' }, CLOSE] }
        if (k === 'ArrowDown') return { state: { ...state, highlighted: wrap(state.highlighted + 1, n) }, effects: [] }
        if (k === 'ArrowUp') return { state: { ...state, highlighted: wrap(state.highlighted - 1, n) }, effects: [] }
        if (k === 'Enter') return chooseOption(state, PICKER_OPTIONS[state.highlighted], ctx)
        const option = k.length === 1 ? optionForKey(k) : undefined
        return option ? chooseOption(state, option, ctx) : none
    }

    if (state.step === 'team') {
        const names = ctx.teams.map((t) => t.name)
        if (k === 'ArrowDown') return { state: { ...state, highlighted: wrap(state.highlighted + 1, names.length) }, effects: [] }
        if (k === 'ArrowUp') return { state: { ...state, highlighted: wrap(state.highlighted - 1, names.length) }, effects: [] }
        if (k === 'Enter') return chooseTeam(state, names[state.highlighted])
        const idx = k.length === 1 ? teamShortcuts(names).indexOf(k.toLowerCase()) : -1
        return idx >= 0 ? chooseTeam(state, names[idx]) : none
    }

    // scorer step — letters go to the text field
    const candidates = scorerCandidates(state, ctx)
    if (k === 'ArrowDown') return { state: { ...state, highlighted: wrap(state.highlighted + 1, candidates.length) }, effects: [] }
    if (k === 'ArrowUp') return { state: { ...state, highlighted: wrap(state.highlighted - 1, candidates.length) }, effects: [] }
    if (k === 'Enter') {
        const pick = state.query.trim() && candidates.length === 0 ? state.query.trim() : candidates[state.highlighted]
        return pick ? chooseScorer(state, pick, ctx) : { state, effects: [CLOSE] }
    }
    return none
}
```

Note on Enter in the scorer step: with a non-empty query and matches, Enter picks the highlighted match; with a non-empty query and **no** matches, Enter adds the typed name; with an empty query, Enter picks the highlighted roster entry or closes if the roster is empty. The test "should add an unknown name" relies on `'New Guy'` matching no roster entry.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/eventPicker.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/eventPicker.ts src/utils/eventPicker.test.ts
git commit -m "feat: pure event picker state machine (type → team → scorer)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Markers, start-in-file and Home target

**Files:**
- Create: `src/utils/markers.ts`, `src/utils/markers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { markersForFile, startInFile, homeTarget } from './markers'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#ffffff', roster: [] }, { name: 'Colours', color: '#ff0000', roster: [] }]
const ev = (id: string, file: number, t: number, extra: Partial<MatchEvent> = {}): MatchEvent =>
    ({ id, matchTimeSec: t, sourceFileIndex: file, type: 'goal', ...extra })

describe('startInFile', () => {
    it('should locate the global start inside the right file', () => {
        expect(startInFile(150, [0, 100], 1, 100)).toBe(50)
        expect(startInFile(150, [0, 100], 0, 100)).toBeNull()
        expect(startInFile(0, [0], 0, 100)).toBe(0)
    })
})

describe('markersForFile', () => {
    it('should place linked events of this file only, coloured by team', () => {
        const events = [ev('a', 0, 25, { team: 'Colours', scorer: 'Jo' }), ev('b', 1, 10), ev('c', 0, 50, { unlinked: true })]
        const m = markersForFile({ events, fileIndex: 0, durationSec: 100, teams, matchStartSec: 0, cumulativeOffsets: [0, 100] })
        expect(m).toEqual([
            { id: 'start', kind: 'start', leftPct: 0, icon: '⚑', color: '#22c55e', title: 'Match start' },
            { id: 'a', kind: 'event', leftPct: 25, icon: '⚽', color: '#ff0000', title: '00:25 Goal – Colours (Jo)' },
        ])
    })

    it('should fall back to the type colour without a team and omit start in other files', () => {
        const m = markersForFile({ events: [ev('b', 1, 10, { type: 'highlight' })], fileIndex: 1, durationSec: 100, teams, matchStartSec: 0, cumulativeOffsets: [0, 100] })
        expect(m).toEqual([{ id: 'b', kind: 'event', leftPct: 10, icon: '★', color: '#4cc9f0', title: '00:10 Highlight' }])
    })

    it('should return nothing without a duration', () => {
        expect(markersForFile({ events: [ev('a', 0, 5)], fileIndex: 0, durationSec: 0, teams, matchStartSec: 0, cumulativeOffsets: [0] })).toEqual([])
    })
})

describe('homeTarget', () => {
    it('should jump to the match start, then to 0 on a second press', () => {
        expect(homeTarget(300, 120)).toBe(120)
        expect(homeTarget(120.2, 120)).toBe(0)
        expect(homeTarget(60, 120)).toBe(0)
        expect(homeTarget(300, null)).toBe(0)
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/markers.test.ts`
Expected: FAIL — import error

- [ ] **Step 3: Implement** `src/utils/markers.ts`

```ts
import type { MatchEvent, Team } from '../types'
import { EVENT_META, eventIcon, eventLabel } from './eventTypes'
import { linkedEvents } from './relink'
import { formatHMS } from './timeline'

export type Marker = {
    id: string
    kind: 'event' | 'start'
    leftPct: number
    icon: string
    color: string
    title: string
}

const START_COLOR = '#22c55e'

export function startInFile(matchStartSec: number, cumulativeOffsets: number[], fileIndex: number, durationSec: number): number | null {
    const local = matchStartSec - (cumulativeOffsets[fileIndex] ?? 0)
    return local >= 0 && local < durationSec ? local : null
}

export function markersForFile(args: {
    events: MatchEvent[]
    fileIndex: number
    durationSec: number
    teams: Team[]
    matchStartSec: number
    cumulativeOffsets: number[]
}): Marker[] {
    const { events, fileIndex, durationSec, teams, matchStartSec, cumulativeOffsets } = args
    if (!durationSec) return []
    const pct = (t: number): number => Math.min(100, Math.max(0, (t / durationSec) * 100))
    const out: Marker[] = []
    const start = startInFile(matchStartSec, cumulativeOffsets, fileIndex, durationSec)
    if (start !== null) out.push({ id: 'start', kind: 'start', leftPct: pct(start), icon: '⚑', color: START_COLOR, title: 'Match start' })
    for (const e of linkedEvents(events)) {
        if ((e.sourceFileIndex ?? 0) !== fileIndex) continue
        const team = teams.find((t) => t.name === e.team)
        const who = e.team ? ` – ${e.team}${e.scorer ? ` (${e.scorer})` : ''}` : ''
        out.push({
            id: e.id,
            kind: 'event',
            leftPct: pct(e.matchTimeSec),
            icon: eventIcon(e),
            color: team?.color ?? EVENT_META[e.type].color,
            title: `${formatHMS(e.matchTimeSec)} ${eventLabel(e)}${who}`,
        })
    }
    return out
}

export function homeTarget(currentSec: number, startSec: number | null): number {
    return startSec !== null && currentSec > startSec + 0.5 ? startSec : 0
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/markers.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/markers.ts src/utils/markers.test.ts
git commit -m "feat: scrubber marker placement and Home-to-match-start target

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Chapters with event labels

**Files:**
- Modify: `src/utils/chapters.ts`
- Test: `src/utils/chapters.test.ts` (append)

Both generators gain an optional last parameter `teamOrder?: string[]`. When given (and non-empty), teams in the score line follow that order and always include both teams; otherwise the current alphabetical behaviour remains. Only `isScoring` events change the score; the final score counts scoring events only.

- [ ] **Step 1: Write the failing tests** (append to `chapters.test.ts`)

```ts
describe('generateYouTubeChapters — event types', () => {
    const e = (id: string, t: number, extra: Partial<MatchEvent>): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', ...extra })

    it('should label penalties, own goals and non-scoring events', () => {
        const events = [
            e('a', 60, { pen: true, team: 'Whites', scorer: 'Sam' }),
            e('b', 120, { type: 'highlight' }),
            e('c', 180, { type: 'own_goal', team: 'Colours', scorer: 'Alex' }),
            e('d', 240, { type: 'penalty_missed', team: 'Whites', scorer: 'Jo' }),
        ]
        const out = generateYouTubeChapters(events, [0], 0, 10, 4, ['Whites', 'Colours'])
        expect(out.split('\n')[0]).toBe('Whites 1-1 Colours')
        expect(out).toContain('00:50 Goal (pen) 1-0 (Whites) Sam')
        expect(out).toContain('01:50 Highlight')
        expect(out).toContain('02:50 Own goal 1-1 (Colours) Alex')
        expect(out).toContain('03:50 Penalty missed (Whites) Jo')
    })
})

describe('generateHighlightChapters — event types', () => {
    it('should not advance the score for non-scoring events', () => {
        const events: MatchEvent[] = [
            { id: 'a', matchTimeSec: 60, sourceFileIndex: 0, type: 'save', team: 'Colours', scorer: 'Jo' },
            { id: 'b', matchTimeSec: 120, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
        ]
        const out = generateHighlightChapters(events, [0], 10, 4, ['Whites', 'Colours'])
        expect(out).toContain('00:00 Save (Colours) Jo')
        expect(out).toContain('00:15 Goal 1-0 (Whites)')
    })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/utils/chapters.test.ts`
Expected: new tests FAIL (labels/score); existing tests PASS

- [ ] **Step 3: Implement** — replace the body of `chapters.ts` with shared helpers used by both generators:

```ts
import type { MatchEvent } from '../types'
import { eventLabel, isScoring } from './eventTypes'

function absTime(e: MatchEvent, offsets: number[]): number {
    return (offsets[e.sourceFileIndex ?? 0] || 0) + e.matchTimeSec
}

function scoreTeams(events: MatchEvent[], teamOrder?: string[]): string[] {
    if (teamOrder && teamOrder.length > 0) return teamOrder
    return Array.from(new Set(events.filter((e) => e.team && isScoring(e)).map((e) => e.team!))).sort()
}

function finalScoreLine(events: MatchEvent[], teams: string[]): string[] {
    if (teams.length === 0) return []
    const totals = teams.map((t) => events.filter((e) => isScoring(e) && e.team === t).length)
    const line = teams.map((t, i) => (i === 0 ? `${t} ${totals[i]}` : `${totals[i]} ${t}`)).join('-')
    return [line, '', '']
}

function chapterLabel(e: MatchEvent, teams: string[], running: Record<string, number>): string {
    let label = eventLabel(e)
    if (isScoring(e)) {
        if (e.team) running[e.team] = (running[e.team] ?? 0) + 1
        if (teams.length > 0) label += ` ${teams.map((t) => running[t] ?? 0).join('-')}`
    }
    if (e.team) label += ` (${e.team})`
    if (e.scorer) label += ` ${e.scorer}`
    return label
}

export function generateYouTubeChapters(
    goals: MatchEvent[], cumulativeOffsets: number[] = [], matchStartTimeSec: number = 0,
    lengthBeforeGoalSec: number = 10, _lengthAfterGoalSec: number = 4, teamOrder?: string[],
): string {
    const hasVideoFiles = cumulativeOffsets.length > 0
    const allFromFirstVideo = goals.every((g) => (g.sourceFileIndex ?? 0) === 0)
    if (!hasVideoFiles && !allFromFirstVideo) return 'Load video files to see timestamps'

    const sorted = [...goals].sort((a, b) => absTime(a, cumulativeOffsets) - absTime(b, cumulativeOffsets))
    const teams = scoreTeams(goals, teamOrder)
    const running: Record<string, number> = {}
    const lines = [...finalScoreLine(goals, teams), '00:00 Start']
    for (const g of sorted) {
        const stamp = secondsToStamp(Math.max(0, Math.floor(absTime(g, cumulativeOffsets) - matchStartTimeSec - lengthBeforeGoalSec)))
        lines.push(`${stamp} ${chapterLabel(g, teams, running)}`)
    }
    return lines.join('\n')
}

export function generateHighlightChapters(
    goals: MatchEvent[], cumulativeOffsets: number[] = [], lengthBeforeGoalSec: number = 10,
    lengthAfterGoalSec: number = 4, teamOrder?: string[],
): string {
    if (goals.length === 0) return '00:00 Start'
    const sorted = [...goals].sort((a, b) => absTime(a, cumulativeOffsets) - absTime(b, cumulativeOffsets))
    const teams = scoreTeams(goals, teamOrder)
    const running: Record<string, number> = {}
    const lines = finalScoreLine(goals, teams)
    const segmentLength = lengthBeforeGoalSec + lengthAfterGoalSec
    sorted.forEach((g, i) => {
        lines.push(`${secondsToStamp(i * (segmentLength + 1))} ${chapterLabel(g, teams, running)}`)
    })
    return lines.join('\n')
}
```

Keep the existing `secondsToStamp` function at the bottom unchanged.

- [ ] **Step 4: Run all chapter tests**

Run: `npx vitest run src/utils/chapters.test.ts`
Expected: all PASS (old and new). If an old test asserted alphabetical order with teams that appear only on non-scoring events, keep the old expectation by not passing `teamOrder` — the plan's `scoreTeams` only collects teams from scoring events, which matches the previous goal-only data.

- [ ] **Step 5: Commit**

```bash
git add src/utils/chapters.ts src/utils/chapters.test.ts
git commit -m "feat: event-type labels and scoring-only score in chapters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Store — teams, picker, markEvent, persist v9

**Files:**
- Modify: `src/state.ts`
- Test: `src/state.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append)

```ts
describe('teams and picker', () => {
    beforeEach(() => {
        useAppState.setState({ files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, undoStack: [], redoStack: [], picker: null })
    })

    it('should default to two named teams with empty rosters', () => {
        const t = useAppState.getInitialState().teams
        expect(t.map((x) => x.name)).toEqual(['Whites', 'Colours'])
        expect(t.every((x) => x.roster.length === 0)).toBe(true)
    })

    it('should mark a goal at the given time and open the picker on it', () => {
        s().markEvent(42.9)
        const [e] = s().events
        expect(e).toMatchObject({ matchTimeSec: 42, sourceFileIndex: 0, type: 'goal' })
        expect(s().picker).toEqual({ eventId: e.id })
        s().closePicker()
        expect(s().picker).toBeNull()
    })

    it('should rename a team and update its events', () => {
        s().setTeams([{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }])
        s().addEvent({ id: 'e', matchTimeSec: 1, sourceFileIndex: 0, type: 'goal', team: 'Whites' })
        s().renameTeam(0, 'Lights')
        expect(s().teams[0].name).toBe('Lights')
        expect(s().events[0].team).toBe('Lights')
    })

    it('should add to a roster without duplicates', () => {
        s().setTeams([{ name: 'Whites', color: '#fff', roster: ['Sam'] }, { name: 'Colours', color: '#f00', roster: [] }])
        s().addToRoster('Whites', 'Jo')
        s().addToRoster('Whites', 'sam')
        expect(s().teams[0].roster).toEqual(['Sam', 'Jo'])
    })

    it('should keep teams on clear()', () => {
        s().setTeams([{ name: 'A', color: '#fff', roster: ['x'] }, { name: 'B', color: '#f00', roster: [] }])
        s().clear()
        expect(s().teams[0]).toMatchObject({ name: 'A', roster: ['x'] })
    })
})
```

(`vf` and `s` are the helpers already defined at the top of `state.test.ts` by sub-project A.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/state.test.ts`
Expected: FAIL — `markEvent is not a function`, `teams` undefined

- [ ] **Step 3: Implement in `src/state.ts`**

Imports:

```ts
import type { MatchEvent, Team, VideoSourceFile } from './types'
import { migrateEvent } from './utils/eventTypes'
```

Add to `AppState`:

```ts
    teams: Team[]
    picker: { eventId: string } | null
    setTeams: (teams: Team[]) => void
    renameTeam: (index: number, name: string) => void
    addToRoster: (team: string, name: string) => void
    markEvent: (timeInFileSec: number) => void
    openPicker: (eventId: string) => void
    closePicker: () => void
```

Initial state (next to `events: []`):

```ts
            teams: [
                { name: 'Whites', color: '#f5f5f5', roster: [] },
                { name: 'Colours', color: '#f72585', roster: [] },
            ],
            picker: null,
```

Actions:

```ts
            setTeams: (teams) => set({ teams }),
            renameTeam: (index, name) => {
                const old = get().teams[index]?.name
                if (old === undefined) return
                set({
                    teams: get().teams.map((t, i) => (i === index ? { ...t, name } : t)),
                    events: get().events.map((e) => (e.team === old ? { ...e, team: name } : e)),
                })
            },
            addToRoster: (team, name) => set({
                teams: get().teams.map((t) =>
                    t.name === team && !t.roster.some((r) => r.toLowerCase() === name.toLowerCase())
                        ? { ...t, roster: [...t.roster, name] }
                        : t),
            }),
            markEvent: (timeInFileSec) => {
                const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
                get().addEvent({ id, matchTimeSec: Math.floor(timeInFileSec), sourceFileIndex: get().currentFileIndex, type: 'goal' })
                set({ picker: { eventId: id } })
            },
            openPicker: (eventId) => set({ picker: { eventId } }),
            closePicker: () => set({ picker: null }),
```

`clear()` already lists explicit fields and does not mention `teams`, so teams survive. Add `picker: null` to `clear()`'s object.

Persist: add `teams: state.teams` to `partialize`; bump `version: 8` → `version: 9`; in `migrate`, replace the "Ensure all events have a type field" block with:

```ts
                if (state.events) {
                    state.events = (state.events as any[]).map((e: any) => migrateEvent(e))
                }
```

- [ ] **Step 4: Run all tests**

Run: `npm run test:run`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/state.ts src/state.test.ts
git commit -m "feat: teams, rosters and event picker state in store (persist v9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Shared TimeInput and time parser (DRY)

`TimeInput` + `parseTimeToSeconds` are duplicated in `ClipSettings.tsx` and `GoalList.tsx`; MatchSetup would be a third copy.

**Files:**
- Modify: `src/utils/timeline.ts`, `src/utils/timeline.test.ts`
- Create: `src/components/TimeInput.tsx`
- Modify: `src/components/ClipSettings.tsx`, `src/components/GoalList.tsx`

- [ ] **Step 1: Write the failing test** (append to `timeline.test.ts`)

```ts
import { parseTimeToSeconds } from './timeline'

describe('parseTimeToSeconds', () => {
    it('should parse seconds, mm:ss and hh:mm:ss', () => {
        expect(parseTimeToSeconds('90')).toBe(90)
        expect(parseTimeToSeconds('1:30')).toBe(90)
        expect(parseTimeToSeconds('01:02:03')).toBe(3723)
    })
    it('should reject invalid input', () => {
        expect(parseTimeToSeconds('')).toBeNull()
        expect(parseTimeToSeconds('1:75')).toBeNull()
        expect(parseTimeToSeconds('abc')).toBeNull()
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/timeline.test.ts`
Expected: FAIL — `parseTimeToSeconds` not exported

- [ ] **Step 3: Implement** — add to `src/utils/timeline.ts`:

```ts
export function parseTimeToSeconds(input: string): number | null {
    const t = input.trim()
    if (!t) return null
    if (/^\d+$/.test(t)) return parseInt(t, 10)
    const parts = t.split(':')
    if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null
    const nums = parts.map((p) => parseInt(p, 10))
    if (nums.slice(1).some((n) => n >= 60)) return null
    return nums.reduce((acc, n) => acc * 60 + n, 0)
}
```

Create `src/components/TimeInput.tsx` from the `TimeInput` in `ClipSettings.tsx`, importing `parseTimeToSeconds` and `formatHMS` from `../utils/timeline`, and adding a `className` prop:

```tsx
import { useEffect, useState } from 'react'
import { formatHMS, parseTimeToSeconds } from '../utils/timeline'

interface TimeInputProps {
    valueSec: number
    onCommit: (seconds: number) => void
    className?: string
    ariaLabel?: string
}

export function TimeInput({ valueSec, onCommit, className, ariaLabel }: TimeInputProps) {
    const [text, setText] = useState(formatHMS(valueSec))
    const [lastValid, setLastValid] = useState(formatHMS(valueSec))

    useEffect(() => {
        const next = formatHMS(valueSec)
        setText(next)
        setLastValid(next)
    }, [valueSec])

    const tryCommit = () => {
        const parsed = parseTimeToSeconds(text)
        if (parsed != null) {
            onCommit(parsed)
            const norm = formatHMS(parsed)
            setText(norm)
            setLastValid(norm)
        } else {
            setText(lastValid)
        }
    }

    return (
        <input
            aria-label={ariaLabel}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={tryCommit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') { setText(lastValid); e.currentTarget.blur() }
            }}
            className={className ?? 'w-[65px] rounded bg-deep border border-border px-2 py-1 text-sm text-light focus:border-pink focus:outline-none'}
        />
    )
}
```

In `ClipSettings.tsx` and `GoalList.tsx`: delete the local `TimeInput` and `parseTimeToSeconds`, `import { TimeInput } from './TimeInput'`. In `GoalList.tsx` pass its existing class string: `className="w-[50px] rounded bg-transparent border-none text-xs font-bold text-pink tabular-nums focus:outline-none p-0"`. Leave `GoalList`'s `parseLine` alone.

- [ ] **Step 4: Run all tests and type-check**

Run: `npm run test:run && npx tsc -b --noEmit`
Expected: PASS, 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/utils/timeline.ts src/utils/timeline.test.ts src/components/TimeInput.tsx src/components/ClipSettings.tsx src/components/GoalList.tsx
git commit -m "refactor: share TimeInput and parseTimeToSeconds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: EventPicker component

**Files:**
- Create: `src/components/EventPicker.tsx`, `src/components/EventPicker.test.tsx`
- Modify: `src/App.css` (append styles)

The component mounts inside `.player-container` (Task 11), so it shows in fullscreen. It holds `PickerState` locally (reset whenever `picker.eventId` changes), feeds keyboard input through a **window capture-phase** listener, and applies effects to the store.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useAppState } from '../state'
import { EventPicker } from './EventPicker'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600 })
const press = (key: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) })
const s = () => useAppState.getState()

describe('EventPicker', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, undoStack: [], redoStack: [], picker: null,
            teams: [{ name: 'Whites', color: '#fff', roster: ['Sam Taylor', 'Sandy Wu'] }, { name: 'Colours', color: '#f00', roster: ['Jo'] }],
        })
        act(() => s().markEvent(100))
    })

    it('should show the type list with Goal highlighted', () => {
        render(<EventPicker />)
        expect(screen.getByRole('option', { name: /goal ⏎/i })).toHaveAttribute('aria-selected', 'true')
    })

    it('should record goal → team → scorer from the keyboard', () => {
        render(<EventPicker />)
        press('Enter')
        press('w')
        fireEvent.change(screen.getByRole('textbox', { name: /scorer/i }), { target: { value: 'sa' } })
        press('ArrowDown')
        press('Enter')
        expect(s().events[0]).toMatchObject({ type: 'goal', team: 'Whites', scorer: 'Sandy Wu' })
        expect(s().picker).toBeNull()
    })

    it('should make a highlight with H and close', () => {
        render(<EventPicker />)
        press('h')
        expect(s().events[0].type).toBe('highlight')
        expect(s().picker).toBeNull()
    })

    it('should delete the new event on Backspace', () => {
        render(<EventPicker />)
        press('Backspace')
        expect(s().events).toEqual([])
    })

    it('should support tapping chips', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /own goal/i }))
        fireEvent.click(screen.getByRole('option', { name: /colours/i }))
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        expect(s().events[0]).toMatchObject({ type: 'own_goal', team: 'Colours', scorer: 'Sam Taylor' })
    })

    it('should stop other keydown listeners while open', () => {
        let leaked = 0
        const spy = () => { leaked++ }
        document.addEventListener('keydown', spy)
        render(<EventPicker />)
        press('f')
        document.removeEventListener('keydown', spy)
        expect(leaked).toBe(0)
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/EventPicker.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement** `src/components/EventPicker.tsx`

```tsx
import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../state'
import { PICKER_OPTIONS, eventIcon } from '../utils/eventTypes'
import { initialPickerState, pickerReducer, scorerCandidates, type PickerInput, type PickerState } from '../utils/eventPicker'
import { teamShortcuts } from '../utils/roster'
import { formatHMS } from '../utils/timeline'

const HANDLED = new Set(['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'Backspace'])

export function EventPicker() {
    const picker = useAppState((s) => s.picker)
    const event = useAppState((s) => s.events.find((e) => e.id === s.picker?.eventId))
    const teams = useAppState((s) => s.teams)
    const [state, setState] = useState<PickerState>(initialPickerState)
    const stateRef = useRef(state)
    stateRef.current = state

    useEffect(() => { setState(initialPickerState) }, [picker?.eventId])

    const dispatch = (input: PickerInput): void => {
        const store = useAppState.getState()
        const id = store.picker?.eventId
        if (!id) return
        const { state: next, effects } = pickerReducer(stateRef.current, input, { teams: store.teams })
        stateRef.current = next
        setState(next)
        for (const fx of effects) {
            if (fx.kind === 'update') store.updateEvent(id, fx.patch)
            else if (fx.kind === 'remove') store.removeEvent(id)
            else if (fx.kind === 'addToRoster') store.addToRoster(fx.team, fx.name)
            else useAppState.getState().closePicker()
        }
    }

    useEffect(() => {
        if (!picker) return
        const onKey = (e: KeyboardEvent): void => {
            if (e.metaKey || e.ctrlKey || e.altKey) return
            e.stopImmediatePropagation()
            const inText = stateRef.current.step === 'scorer'
            const isLetter = e.key.length === 1
            if (HANDLED.has(e.key) && !(inText && e.key === 'Backspace')) {
                e.preventDefault()
                dispatch({ kind: 'key', key: e.key })
            } else if (isLetter && !inText) {
                e.preventDefault()
                dispatch({ kind: 'key', key: e.key })
            }
            // letters in the scorer step fall through to the focused text field (default action not prevented)
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [picker])

    if (!picker || !event) return null

    const names = teams.map((t) => t.name)
    const shortcuts = teamShortcuts(names)
    const candidates = scorerCandidates(state, { teams })
    const title = `${formatHMS(event.matchTimeSec)} ${eventIcon(event)}`

    return (
        <div className="event-picker" role="dialog" aria-label="Event details">
            <div className="event-picker__title">{title}{state.team ? ` · ${state.team}` : ''}</div>

            {state.step === 'type' && (
                <ul role="listbox" className="event-picker__list">
                    {PICKER_OPTIONS.map((o, i) => (
                        <li key={o.id} role="option" aria-selected={i === state.highlighted}
                            className="event-picker__item" onClick={() => dispatch({ kind: 'choose', value: o.id })}>
                            <span>{o.label}</span>
                            <kbd>{o.id === 'goal' ? 'G ⏎' : o.key.toUpperCase()}</kbd>
                        </li>
                    ))}
                </ul>
            )}

            {state.step === 'team' && (
                <ul role="listbox" className="event-picker__list">
                    {names.map((n, i) => (
                        <li key={n} role="option" aria-selected={i === state.highlighted}
                            className="event-picker__item" onClick={() => dispatch({ kind: 'choose', value: n })}>
                            <span>{n}</span>
                            <kbd>{shortcuts[i].toUpperCase()}</kbd>
                        </li>
                    ))}
                </ul>
            )}

            {state.step === 'scorer' && (
                <div>
                    <input
                        autoFocus
                        aria-label="Scorer"
                        className="event-picker__input"
                        placeholder="Scorer — type to filter, Enter to pick"
                        value={state.query}
                        onChange={(e) => dispatch({ kind: 'text', value: e.target.value })}
                    />
                    <ul role="listbox" className="event-picker__list">
                        {candidates.map((n, i) => (
                            <li key={n} role="option" aria-selected={i === state.highlighted}
                                className="event-picker__item" onClick={() => dispatch({ kind: 'choose', value: n })}>
                                <span>{n}</span>
                            </li>
                        ))}
                        {state.query.trim() && candidates.length === 0 && (
                            <li role="option" aria-selected className="event-picker__item"
                                onClick={() => dispatch({ kind: 'choose', value: state.query.trim() })}>
                                <span>+ add “{state.query.trim()}”</span>
                            </li>
                        )}
                    </ul>
                </div>
            )}
            <div className="event-picker__hint">Esc to finish{state.step === 'type' ? ' · ⌫ cancel' : ''}</div>
        </div>
    )
}
```

Note on the "add" row: the reducer only adds a new name when the query matches no roster entry, so the row is shown only in that case.

- [ ] **Step 4: Append styles to `src/App.css`**

```css
/* Event picker: popover on desktop, bottom sheet on mobile */
.event-picker {
  position: absolute;
  left: 12px;
  bottom: 48px;
  z-index: 30;
  width: 240px;
  max-height: 70%;
  overflow-y: auto;
  border-radius: 8px;
  background: rgba(10, 10, 20, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 13px;
  padding: 8px;
  pointer-events: auto;
}
.event-picker__title { font-weight: 700; margin-bottom: 6px; color: #f72585; }
.event-picker__list { list-style: none; margin: 0; padding: 0; }
.event-picker__item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 8px; border-radius: 6px; cursor: pointer;
}
.event-picker__item[aria-selected="true"] { background: rgba(247, 37, 133, 0.35); }
.event-picker__item kbd { font-size: 11px; opacity: 0.7; }
.event-picker__input {
  width: 100%; box-sizing: border-box; margin-bottom: 6px; padding: 6px 8px;
  border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: #111; color: #fff;
}
.event-picker__hint { margin-top: 6px; font-size: 11px; opacity: 0.6; }

@media (max-width: 768px) {
  .event-picker {
    position: fixed; left: 0; right: 0; bottom: 0; width: auto; max-height: 60vh;
    border-radius: 14px 14px 0 0; padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
    font-size: 16px;
  }
  .event-picker__list { display: flex; flex-wrap: wrap; gap: 8px; }
  .event-picker__item { padding: 12px 14px; border: 1px solid rgba(255, 255, 255, 0.2); }
  .event-picker__item kbd { display: none; }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/EventPicker.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/EventPicker.tsx src/components/EventPicker.test.tsx src/App.css
git commit -m "feat: event picker UI with keyboard capture and mobile sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: MatchSetup panel and project export/import

**Files:**
- Create: `src/components/MatchSetup.tsx`, `src/components/MatchSetup.test.tsx`
- Modify: `src/components/ClipSettings.tsx` (remove match start input), `src/App.tsx` (Match button; export/import)

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { MatchSetup } from './MatchSetup'

const s = () => useAppState.getState()

describe('MatchSetup', () => {
    beforeEach(() => {
        useAppState.setState({
            teams: [{ name: 'Whites', color: '#f5f5f5', roster: [] }, { name: 'Colours', color: '#f72585', roster: [] }],
            events: [{ id: 'e', matchTimeSec: 1, sourceFileIndex: 0, type: 'goal', team: 'Whites' }],
            files: [], cumulativeOffsets: [], currentFileIndex: 0, currentTimeInFileSec: 75, matchStartTimeSec: 0,
        })
    })

    it('should rename a team and update its events', async () => {
        render(<MatchSetup onClose={() => {}} />)
        const name = screen.getByLabelText('Team 1 name')
        await userEvent.clear(name)
        await userEvent.type(name, 'Lights')
        fireEvent.blur(name)
        expect(s().teams[0].name).toBe('Lights')
        expect(s().events[0].team).toBe('Lights')
    })

    it('should parse a pasted roster on blur', () => {
        render(<MatchSetup onClose={() => {}} />)
        const roster = screen.getByLabelText('Team 2 roster')
        fireEvent.change(roster, { target: { value: '1. Jo\n2. Alex, Jo' } })
        fireEvent.blur(roster)
        expect(s().teams[1].roster).toEqual(['Jo', 'Alex'])
    })

    it('should set the match start from the current time', async () => {
        render(<MatchSetup onClose={() => {}} />)
        await userEvent.click(screen.getByRole('button', { name: /use current time/i }))
        expect(s().matchStartTimeSec).toBe(75)
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/MatchSetup.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement** `src/components/MatchSetup.tsx`

```tsx
import { useState } from 'react'
import { useAppState } from '../state'
import { parseRoster } from '../utils/roster'
import { TimeInput } from './TimeInput'

const SWATCHES = ['#f5f5f5', '#f72585', '#4cc9f0', '#fee440', '#22c55e', '#f4a261']

interface MatchSetupProps {
    onClose: () => void
}

export function MatchSetup({ onClose }: MatchSetupProps) {
    const teams = useAppState((s) => s.teams)
    const setTeams = useAppState((s) => s.setTeams)
    const renameTeam = useAppState((s) => s.renameTeam)
    const matchStartTimeSec = useAppState((s) => s.matchStartTimeSec)
    const setMatchStartTime = useAppState((s) => s.setMatchStartTime)
    const [names, setNames] = useState(teams.map((t) => t.name))
    const [rosters, setRosters] = useState(teams.map((t) => t.roster.join('\n')))

    const useCurrentTime = (): void => {
        const st = useAppState.getState()
        setMatchStartTime(Math.floor((st.cumulativeOffsets[st.currentFileIndex] ?? 0) + st.currentTimeInFileSec))
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="w-full max-w-2xl rounded-lg bg-surface p-4" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-light">Match setup</span>
                    <button onClick={onClose} className="bg-transparent border-none text-muted hover:text-light cursor-pointer">✕</button>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {teams.map((team, i) => (
                        <div key={i} className="flex flex-col gap-2">
                            <input
                                aria-label={`Team ${i + 1} name`}
                                value={names[i]}
                                onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
                                onBlur={() => names[i].trim() && names[i] !== team.name && renameTeam(i, names[i].trim())}
                                className="rounded bg-deep border border-border px-2 py-1.5 text-sm font-bold text-light focus:border-pink focus:outline-none"
                            />
                            <div className="flex gap-1.5">
                                {SWATCHES.map((c) => (
                                    <button
                                        key={c}
                                        aria-label={`Team ${i + 1} colour ${c}`}
                                        onClick={() => setTeams(teams.map((t, j) => (j === i ? { ...t, color: c } : t)))}
                                        className={`h-5 w-5 rounded-full border-2 cursor-pointer ${team.color === c ? 'border-light' : 'border-transparent'}`}
                                        style={{ background: c }}
                                    />
                                ))}
                            </div>
                            <textarea
                                aria-label={`Team ${i + 1} roster`}
                                placeholder="Paste players — one per line or comma-separated"
                                value={rosters[i]}
                                onChange={(e) => setRosters(rosters.map((r, j) => (j === i ? e.target.value : r)))}
                                onBlur={() => {
                                    const roster = parseRoster(rosters[i])
                                    setTeams(useAppState.getState().teams.map((t, j) => (j === i ? { ...t, roster } : t)))
                                    setRosters(rosters.map((r, j) => (j === i ? roster.join('\n') : r)))
                                }}
                                className="h-36 rounded bg-deep border border-border px-2 py-1.5 text-sm text-light focus:border-pink focus:outline-none"
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <span className="text-xs text-muted">Match start</span>
                    <TimeInput valueSec={matchStartTimeSec} onCommit={setMatchStartTime} ariaLabel="Match start" />
                    <button onClick={useCurrentTime} className="rounded bg-deep px-2 py-1 text-xs text-light border border-border cursor-pointer hover:border-pink">
                        Use current time
                    </button>
                </div>
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Remove match start from `ClipSettings.tsx`** — delete the "Match start offset" block and the now-unused `matchStartTimeSec`/`setMatchStartTime` selectors (keep the "Adjust timestamps by offset" checkbox).

- [ ] **Step 5: Wire `App.tsx`**

Imports and state:

```tsx
import { useState } from 'react'
import { MatchSetup } from './components/MatchSetup'
import { migrateEvent } from './utils/eventTypes'
// inside App():
    const [showMatch, setShowMatch] = useState(false)
```

(merge `useState` into the existing `react` import).

Top bar, before the Export button:

```tsx
                    <button
                        onClick={() => setShowMatch(true)}
                        className="rounded bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted border-none cursor-pointer hover:text-light transition-colors"
                    >
                        Match
                    </button>
```

and at the end of the root `<div>`: `{showMatch && <MatchSetup onClose={() => setShowMatch(false)} />}`.

Export: include teams:

```ts
        const { teams, matchStartTimeSec } = useAppState.getState()
        const blob = new Blob([JSON.stringify({ events: goals, goals, teams, matchStartTimeSec }, null, 2)], { type: 'application/json' })
```

Import: migrate events and restore teams/start when present:

```ts
            if (imported) {
                setGoals(imported.map((e: unknown) => migrateEvent(e as Parameters<typeof migrateEvent>[0])))
            }
            if (Array.isArray(data.teams) && data.teams.length === 2) useAppState.getState().setTeams(data.teams)
            if (typeof data.matchStartTimeSec === 'number') useAppState.getState().setMatchStartTime(data.matchStartTimeSec)
```

Also add `kind`-agnostic note: do not touch the default-video `setFiles` block.

- [ ] **Step 6: Run tests**

Run: `npm run test:run && npx tsc -b --noEmit`
Expected: PASS, 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/components/MatchSetup.tsx src/components/MatchSetup.test.tsx src/components/ClipSettings.tsx src/App.tsx
git commit -m "feat: match setup (teams, colours, rosters, start) and project export of teams

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Container fullscreen

**Files:**
- Create: `src/components/fullscreen.ts`, `src/components/fullscreen.test.ts`
- Modify: `src/App.css`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { patchPlayerFullscreen, type FullscreenPlayer } from './fullscreen'

function fakePlayer(): FullscreenPlayer & { classFs: boolean | undefined } {
    const p = {
        classFs: undefined as boolean | undefined,
        requestFullscreen: vi.fn(),
        exitFullscreen: vi.fn(),
        isFullscreen(v?: boolean) { if (v !== undefined) p.classFs = v; return !!p.classFs },
        trigger: vi.fn(),
    }
    return p
}

describe('patchPlayerFullscreen', () => {
    it('should fullscreen the container instead of the player element', () => {
        const container = document.createElement('div')
        container.requestFullscreen = vi.fn(() => Promise.resolve())
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => container)
        player.requestFullscreen()
        expect(container.requestFullscreen).toHaveBeenCalled()
    })

    it('should report fullscreen from the document and still toggle the video.js class', () => {
        const player = fakePlayer()
        const orig = player.isFullscreen
        patchPlayerFullscreen(player, () => null)
        expect(player.isFullscreen()).toBe(false)
        player.isFullscreen(true)
        expect(orig.call(player)).toBe(true)
    })

    it('should exit through the document', () => {
        document.exitFullscreen = vi.fn(() => Promise.resolve())
        const player = fakePlayer()
        patchPlayerFullscreen(player, () => null)
        player.exitFullscreen()
        expect(document.exitFullscreen).toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/fullscreen.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement** `src/components/fullscreen.ts`

```ts
// video.js fullscreens its own element, which hides our overlays (picker, ＋, speed).
// Redirect its fullscreen API to the app's player container.

export type FullscreenPlayer = {
    requestFullscreen: () => unknown
    exitFullscreen: () => unknown
    isFullscreen: (value?: boolean) => boolean
    trigger: (event: string) => unknown
}

type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void }

function docFullscreenElement(): Element | null {
    const d = document as WebkitDocument
    return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

export function patchPlayerFullscreen(player: FullscreenPlayer, getContainer: () => HTMLElement | null): () => void {
    const setVjsClass = player.isFullscreen.bind(player)

    player.requestFullscreen = () => {
        const el = getContainer() as WebkitElement | null
        if (!el) return
        if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined)
        else el.webkitRequestFullscreen?.()
    }
    player.exitFullscreen = () => {
        const d = document as WebkitDocument
        if (d.exitFullscreen) void d.exitFullscreen().catch(() => undefined)
        else d.webkitExitFullscreen?.()
    }
    player.isFullscreen = (value?: boolean) => {
        if (value !== undefined) return setVjsClass(value)
        return docFullscreenElement() !== null
    }

    const onChange = (): void => {
        setVjsClass(docFullscreenElement() !== null)
        player.trigger('fullscreenchange')
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
        document.removeEventListener('fullscreenchange', onChange)
        document.removeEventListener('webkitfullscreenchange', onChange)
    }
}
```

- [ ] **Step 4: Append styles to `src/App.css`**

```css
/* Container fullscreen (see components/fullscreen.ts) */
.player-container:fullscreen {
  max-height: none;
  width: 100vw;
  height: 100vh;
  border-radius: 0;
  background: #000;
}
.player-container:fullscreen .video-js { width: 100%; height: 100%; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/fullscreen.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/fullscreen.ts src/components/fullscreen.test.ts src/App.css
git commit -m "feat: fullscreen the player container so overlays stay visible

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: TimelineMarkers and Player wiring

**Files:**
- Create: `src/components/TimelineMarkers.tsx`, `src/components/TimelineMarkers.test.tsx`
- Modify: `src/components/Player.tsx`, `src/App.css`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useAppState } from '../state'
import { TimelineMarkers } from './TimelineMarkers'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 200 })

describe('TimelineMarkers', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')], cumulativeOffsets: [0], currentFileIndex: 0, matchStartTimeSec: 20, lengthBeforeGoalSec: 10,
            events: [{ id: 'e', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', team: 'Whites' }],
        })
    })

    it('should render the start flag and event markers into the host', () => {
        const host = document.createElement('div')
        render(<TimelineMarkers host={host} durationSec={200} />)
        const markers = host.querySelectorAll('.timeline-marker')
        expect(markers).toHaveLength(2)
        expect((markers[1] as HTMLElement).style.left).toBe('50%')
    })

    it('should seek to the clip start on click', () => {
        const seek = vi.spyOn(useAppState.getState(), 'seekToGoal')
        const host = document.createElement('div')
        render(<TimelineMarkers host={host} durationSec={200} />)
        fireEvent.click(host.querySelectorAll('.timeline-marker')[1])
        expect(seek).toHaveBeenCalledWith(0, 90)
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/TimelineMarkers.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement** `src/components/TimelineMarkers.tsx`

```tsx
import { createPortal } from 'react-dom'
import { useAppState } from '../state'
import { markersForFile } from '../utils/markers'

interface TimelineMarkersProps {
    host: HTMLElement | null
    durationSec: number
}

export function TimelineMarkers({ host, durationSec }: TimelineMarkersProps) {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const fileIndex = useAppState((s) => s.currentFileIndex)
    const matchStartSec = useAppState((s) => s.matchStartTimeSec)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    if (!host) return null

    const markers = markersForFile({ events, fileIndex, durationSec, teams, matchStartSec, cumulativeOffsets })
    const stop = (e: React.SyntheticEvent): void => e.stopPropagation()

    return createPortal(
        <>
            {markers.map((m) => (
                <button
                    key={m.id}
                    type="button"
                    className={`timeline-marker timeline-marker--${m.kind}`}
                    style={{ left: `${m.leftPct}%`, color: m.color }}
                    title={m.title}
                    aria-label={m.title}
                    onMouseDown={stop}
                    onTouchStart={stop}
                    onClick={(e) => {
                        e.stopPropagation()
                        const ev = events.find((x) => x.id === m.id)
                        if (ev) useAppState.getState().seekToGoal(fileIndex, Math.max(0, ev.matchTimeSec - before))
                    }}
                >
                    {m.icon}
                </button>
            ))}
        </>,
        host,
    )
}
```

Clicking the start flag does nothing extra (Home handles it); it has no matching event.

- [ ] **Step 4: Append marker styles to `src/App.css`**

```css
/* Scrubber markers */
.video-js .vjs-progress-holder { overflow: visible; }
.timeline-marker {
  position: absolute;
  bottom: 100%;
  transform: translateX(-50%);
  margin-bottom: 2px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  z-index: 2;
  text-shadow: 0 0 2px #000;
}
.timeline-marker--start { font-size: 13px; }
```

- [ ] **Step 5: Wire `Player.tsx`**

Imports:

```tsx
import { EventPicker } from './EventPicker'
import { TimelineMarkers } from './TimelineMarkers'
import { patchPlayerFullscreen, type FullscreenPlayer } from './fullscreen'
import { homeTarget, startInFile } from '../utils/markers'
```

State (with the other `useState`s):

```tsx
    const [durationSec, setDurationSec] = useState(0)
    const [progressHost, setProgressHost] = useState<HTMLElement | null>(null)
```

Right after `playerRef.current = videojs(...)`:

```tsx
            patchPlayerFullscreen(playerRef.current as unknown as FullscreenPlayer, () => containerRef.current)
```

Inside `playerRef.current.ready(() => { … })`, before `.hotkeys(...)`:

```tsx
                setProgressHost(playerRef.current.el().querySelector('.vjs-progress-holder'))
```

Replace the `addGoal` custom key handler:

```tsx
                                handler: function (player: any) {
                                    useAppState.getState().markEvent(player.currentTime() || 0)
                                }
```

Replace the `jumpToStart` handler:

```tsx
                                handler: function (player: any) {
                                    const st = useAppState.getState()
                                    const start = startInFile(st.matchStartTimeSec, st.cumulativeOffsets, st.currentFileIndex, player.duration() || 0)
                                    player.currentTime(homeTarget(player.currentTime() || 0, start))
                                }
```

Remove the now-unused `const addGoal = useAppState((s) => s.addEvent)`.

Next to the existing `p.on('timeupdate', …)`:

```tsx
        p.on('durationchange', () => setDurationSec(p.duration() || 0))
```

In the returned JSX, inside `.player-container` after `<FullscreenControls … />`:

```tsx
            <EventPicker />
            <TimelineMarkers host={progressHost} durationSec={durationSec} />
```

- [ ] **Step 6: Run tests and type-check**

Run: `npm run test:run && npx tsc -b --noEmit`
Expected: PASS, 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/components/TimelineMarkers.tsx src/components/TimelineMarkers.test.tsx src/components/Player.tsx src/App.css
git commit -m "feat: scrubber event markers, G opens picker, Home to match start, container fullscreen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Entry points — AddGoalBar, mobile overlay, GoalList chip

**Files:**
- Modify: `src/components/AddGoalBar.tsx`, `src/components/AddGoalBar.test.tsx`
- Modify: `src/components/FullscreenControls.tsx`, `src/components/FullscreenControls.test.tsx`
- Modify: `src/components/GoalList.tsx`

- [ ] **Step 1: Update the AddGoalBar test** — replace the "should add a goal at the current playback time" test:

```tsx
    it('should mark an event at the current time and open the picker', async () => {
        render(<AddGoalBar />)
        await userEvent.click(screen.getByRole('button', { name: /\+ event/i }))
        const [e] = useAppState.getState().events
        expect(e).toMatchObject({ matchTimeSec: 42, sourceFileIndex: 0, type: 'goal' })
        expect(useAppState.getState().picker).toEqual({ eventId: e.id })
    })

    it('should not show team or scorer inputs', () => {
        render(<AddGoalBar />)
        expect(screen.queryByPlaceholderText('Team')).not.toBeInTheDocument()
    })
```

Add a FullscreenControls test:

```tsx
    it('should mark an event from the overlay button', () => {
        const player = fakePlayer()
        useAppState.setState({ events: [], picker: null, currentFileIndex: 0, files: [] })
        const { getByRole } = render(<FullscreenControls playerRef={{ current: player }} isFullscreen />)
        fireEvent.click(getByRole('button', { name: /event/i }))
        expect(useAppState.getState().events[0]).toMatchObject({ matchTimeSec: 20, type: 'goal' })
        expect(useAppState.getState().picker).not.toBeNull()
    })
```

(import `useAppState` from `'../state'` at the top of that test file.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/AddGoalBar.test.tsx src/components/FullscreenControls.test.tsx`
Expected: new tests FAIL

- [ ] **Step 3: Rewrite `AddGoalBar.tsx`**

```tsx
import { useAppState } from '../state'
import { formatHMS } from '../utils/timeline'

export function AddGoalBar() {
    const currentTime = useAppState((s) => s.currentTimeInFileSec)
    const markEvent = useAppState((s) => s.markEvent)
    const files = useAppState((s) => s.files)

    if (files.length === 0) return null

    return (
        <div className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 flex-wrap">
            <span className="w-[70px] text-sm font-semibold text-pink tabular-nums">{formatHMS(currentTime)}</span>
            <button
                onClick={() => markEvent(currentTime)}
                className="rounded bg-pink px-3 py-1.5 text-sm font-bold text-white border-none cursor-pointer hover:bg-pink/80 transition-colors"
            >
                + Event
            </button>
            <span className="ml-auto text-xs text-muted hidden md:inline">
                Press <kbd className="rounded bg-deep px-1.5 py-0.5 text-yellow font-bold text-[10px]">G</kbd>, then ⏎ for a goal or a letter for another event
            </span>
        </div>
    )
}
```

- [ ] **Step 4: Simplify `FullscreenControls.tsx`**

- Remove state `showAddGoalModal`, `teamName`, `playerName`; remove `handleSubmitGoal`, `handleCancelGoal`, the `Goal` type import, the `addGoal`/`currentFileIndex` selectors, and the whole `{showAddGoalModal && (…)}` modal block.
- Replace `handleAddGoal`:

```tsx
    const handleAddGoal = () => {
        const player = playerRef.current
        if (player) useAppState.getState().markEvent(player.currentTime() || 0)
    }
```

- Change the button label `<span>Goal</span>` → `<span>Event</span>` and add `aria-label="Event"` on the button.
- Delete the now-unused `.goal-modal*` rules from `src/App.css`.

- [ ] **Step 5: GoalList type chip** — in the event row, before the `TimeInput`, add:

```tsx
                            <span className="text-xs" title={eventLabel(g)} style={{ color: EVENT_META[g.type].color }}>
                                {eventIcon(g)}
                            </span>
```

and after the file tag `<span>`:

```tsx
                            <span className="text-[10px] text-muted">{eventLabel(g)}</span>
```

with `import { EVENT_META, eventIcon, eventLabel } from '../utils/eventTypes'`. Rename the panel heading "Goals" → "Events" and "No goals marked yet. Press G during playback to mark a goal." → "No events yet. Press G during playback to mark one."

- [ ] **Step 6: Run all tests and type-check**

Run: `npm run test:run && npx tsc -b --noEmit && npm run lint 2>&1 | tail -3`
Expected: all PASS, 0 type errors, lint count not higher than baseline (26).

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat: + Event bar, mobile overlay and event list use the picker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Output — scores and chapter copy

**Files:**
- Create: `src/components/ChaptersCopy.tsx`, `src/components/ChaptersCopy.test.tsx`
- Modify: `src/components/OutputPanel.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { ChaptersCopy } from './ChaptersCopy'

describe('ChaptersCopy', () => {
    beforeEach(() => {
        useAppState.setState({
            cumulativeOffsets: [0], matchStartTimeSec: 0, lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
            events: [{ id: 'a', matchTimeSec: 60, sourceFileIndex: 0, type: 'goal', team: 'Whites' }],
        })
    })

    it('should copy YouTube chapters to the clipboard and confirm', async () => {
        const writeText = vi.fn(() => Promise.resolve())
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        render(<ChaptersCopy />)
        await userEvent.click(screen.getByRole('button', { name: /youtube chapters/i }))
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('00:50 Goal 1-0 (Whites)'))
        expect(await screen.findByText(/copied/i)).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ChaptersCopy.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement** `src/components/ChaptersCopy.tsx`

```tsx
import { useState } from 'react'
import { useAppState } from '../state'
import { generateHighlightChapters, generateYouTubeChapters } from '../utils/chapters'
import { linkedEvents } from '../utils/relink'

export function ChaptersCopy() {
    const events = useAppState((s) => s.events)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const start = useAppState((s) => s.matchStartTimeSec)
    const before = useAppState((s) => s.lengthBeforeGoalSec)
    const after = useAppState((s) => s.lengthAfterGoalSec)
    const teams = useAppState((s) => s.teams)
    const [copied, setCopied] = useState<string | null>(null)

    const linked = linkedEvents(events)
    const order = teams.map((t) => t.name)
    const copy = async (label: string, text: string): Promise<void> => {
        await navigator.clipboard.writeText(text)
        setCopied(label)
        setTimeout(() => setCopied(null), 1500)
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                disabled={linked.length === 0}
                onClick={() => copy('YouTube', generateYouTubeChapters(linked, offsets, start, before, after, order))}
                className="rounded bg-deep px-2 py-1 text-xs text-light border border-border cursor-pointer hover:border-pink disabled:opacity-30"
            >
                Copy YouTube chapters
            </button>
            <button
                disabled={linked.length === 0}
                onClick={() => copy('Highlight', generateHighlightChapters(linked, offsets, before, after, order))}
                className="rounded bg-deep px-2 py-1 text-xs text-light border border-border cursor-pointer hover:border-pink disabled:opacity-30"
            >
                Copy highlight chapters
            </button>
            {copied && <span className="text-xs text-yellow">{copied} chapters copied</span>}
        </div>
    )
}
```

- [ ] **Step 4: Update `OutputPanel.tsx`** — score in team order, scoring events only, plus `ChaptersCopy`:

```tsx
import { useMemo } from 'react'
import { useAppState } from '../state'
import { PreviewControls } from './PreviewControls'
import { RenderHighlights } from './RenderHighlights'
import { ChaptersCopy } from './ChaptersCopy'
import { linkedEvents } from '../utils/relink'
import { isScoring } from '../utils/eventTypes'

export function OutputPanel() {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)

    const score = useMemo(() => {
        const scoring = linkedEvents(events).filter(isScoring)
        return teams.map((t) => ({ name: t.name, goals: scoring.filter((e) => e.team === t.name).length }))
    }, [events, teams])
    const anyScored = score.some((t) => t.goals > 0)

    return (
        <div className="rounded-md bg-surface p-3">
            <span className="text-xs font-bold uppercase tracking-wider text-light block mb-2.5">Output</span>

            <div className="flex flex-col gap-2">
                <PreviewControls />
                <RenderHighlights />
                <ChaptersCopy />
            </div>

            {anyScored && score.length >= 2 && (
                <div className="mt-3 pt-2.5 border-t border-deep flex items-center justify-center gap-2">
                    <span className="text-sm font-bold text-light">{score[0].name}</span>
                    <span className="text-base font-black text-yellow">
                        {score[0].goals} - {score[1].goals}
                    </span>
                    <span className="text-sm font-bold text-light">{score[1].name}</span>
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 5: Run all tests**

Run: `npm run test:run`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/ChaptersCopy.tsx src/components/ChaptersCopy.test.tsx src/components/OutputPanel.tsx
git commit -m "feat: copy YouTube/highlight chapters; score from scoring events in team order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Browser verification and docs

- [ ] **Step 1: Run the app** on port 5176 (`npx vite --port 5176 --strictPort`) and drive it with a headless browser (Playwright MCP tools if available and not in use by another agent; otherwise Playwright via a Node script). Use a generated test MP4:

```bash
ffmpeg -f lavfi -i testsrc=duration=120:size=1280x720:rate=30 -f lavfi -i sine=duration=120 -c:v libx264 -g 30 -c:a aac -shortest /tmp/c-test.mp4
```

Verify and record results:
1. Match → rename Whites to "Lights", paste roster `1. Sam\n2. Jo`, Use current time at 0:10.
2. Play; press G at ~0:30 → picker shows; Enter → team step; L → scorer; type "jo" → Enter. Event row shows ⚽ Goal, Lights, Jo. A ⚽ marker sits at 25% of the scrubber; ⚑ at ~8%.
3. G → H → highlight marker ★, no team step.
4. G → Backspace → no new event.
5. While picker open, press F and M → no fullscreen, no mute.
6. Home from 0:40 → 0:10; Home again → 0:00.
7. Press F (picker closed) → fullscreen shows the overlay (speed controls, Event button). Press G in fullscreen → picker visible. Esc closes picker; second Esc exits fullscreen.
8. At 390×844: tap Event → bottom sheet with chips; tap Own goal → Colours → Sam.
9. Copy YouTube chapters (read `navigator.clipboard` via evaluate or check the button feedback) → contains `Goal 1-0 (Lights) Jo` and `Own goal`.

- [ ] **Step 2: Update `CLAUDE.md`** — shortcut table: `| **G** | Mark event (opens picker: ⏎/G goal, P pen, O own goal, A pen awarded, X pen missed, H highlight, F foul, S save) |` and `| **Home** | Jump to match start (press again for 0:00) |`; architecture list: add `EventPicker.tsx`, `MatchSetup.tsx`, `TimelineMarkers.tsx`, `ChaptersCopy.tsx`, `TimeInput.tsx` and utils `eventTypes.ts`, `eventPicker.ts`, `roster.ts`, `markers.ts`.

- [ ] **Step 3: Final checks**

Run: `npm run test:run && npx tsc -b --noEmit && npm run build`
Expected: all PASS, 0 errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: event picker, match setup and new shortcuts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Merge notes

- B (`feat/gopro-import`) will need `linkedEvents` in its `RenderHighlights` (already in A's merge notes) — unaffected by C.
- C touches `App.tsx` (top bar + import/export). B touched `App.tsx` only in the default-video `setFiles` block (`kind: 'full'`). Expect a trivial merge.
