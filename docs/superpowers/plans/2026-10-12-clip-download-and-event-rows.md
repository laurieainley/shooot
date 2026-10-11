# Clip download and calmer event rows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slimmer event rows whose selected row expands into an action row, and a per-event clip download (clip + replay, caption, optional score, Shooot sting).

**Architecture:** Part A changes only the events rail (`EventLog.tsx`, a new `EventActions.tsx`, `utils/eventRow.ts`, CSS). Part B adds a pure plan (`clipExport`) on top of the existing reel planning (`mergeOverlappingGoalSegments` → `buildRenderPlan` → `buildGraphicsSpec`), a sting outro card, a `'clip'` render-job kind and a popover; rendering goes through the unchanged engine (`renderReel`) via the existing render manager.

**Tech Stack:** React 19 + TypeScript strict, Zustand 5 (persisted `vhm-state`), Vitest + RTL + happy-dom, Mediabunny/WebCodecs engine (untouched).

**Spec:** `docs/superpowers/specs/2026-10-10-clip-download-and-event-rows-design.md` (read it first; this plan argues from it).

## Global Constraints

- Read `AGENTS.md` before starting (§5 rendering rules, §7 conventions, §8 process). Do not edit AGENTS.md/CLAUDE.md; report doc changes.
- Utils are pure with a `*.test.ts`; components one per file, named exports, props interface above the component.
- Colours only via `--sh-*` tokens; lime only for the primary action (the popover's Download button). Chalk icons elsewhere.
- Touch targets ≥ 44 px; touch text ≥ 14 px; desktop row text drops by 1 px (13 → 12 px clock/score, name 1 px smaller than today).
- UK English, sentence case, "tag" not "mark"; error/instruction copy plain.
- Persisted state change → version bump (take the next free number at implementation time; `src/state.ts` is at 20 today) + migration + test.
- Never use port 5174 (the user's). Part A dev server: 5181. Part B dev server: 5182.
- Generated test media only (ffmpeg, scratchpad, ≤ 30 s); never search the user's home/camera folders; delete media > 5 MB when done.
- Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013AvURaxZsZUomPaVjxSBhV
  ```
- Do not merge or push. Before reporting: `npm run test:run`, `npx tsc -b --noEmit`, `npm run lint` (no new problems vs main), `npm run build` — check exit codes.

## Review Focus

1. **A row being edited inline (scorer/team/note input open) must not collapse or lose focus when it is the selected, expanded row** — typing Backspace in the note field must not delete the event. Test in Task A2.
2. **Unlinked events** (file missing): the action row still opens; Download is disabled with "Relink the file first"; Watch stays disabled. Test in Task A2 and B6.
3. **Clip near a file boundary / file start**: an event at 3 s into file 2 must produce a cross-file clip (tail of file 1 + head of file 2) and a caption only on the clip part that contains the event. Test in Task B4.
4. **Overlapping neighbour events**: a clip for event X must caption only X even when event Y is 5 s later and inside X's padding. Test in Task B4.
5. **A second Download while a render runs** must not start or queue anything; the popover says "A render is in progress". Test in Task B6.

---

# Part A — Calmer event rows (branch `feat/event-rows`, worktree `.claude/worktrees/event-rows`)

### Task A1: `eventRowParts` without assists; note as a single field

**Files:**
- Modify: `src/utils/eventRow.ts`
- Test: `src/utils/eventRow.test.ts`

**Interfaces:**
- Produces: `eventRowParts(e: Pick<MatchEvent, 'type' | 'pen' | 'scorer' | 'notes'>): { person: string | undefined; note: string | undefined; title: string }` (the `sub` array and assist are gone).

- [ ] **Step 1: Write the failing tests** (replace the existing `describe('eventRowParts')` cases that mention assists)

```ts
import { describe, it, expect } from 'vitest'
import { eventRowParts } from './eventRow'

describe('eventRowParts', () => {
    it('should give the person and the short note, never an assist', () => {
        const p = eventRowParts({ type: 'goal', scorer: ' James ', notes: 'top corner', assist: 'Joe' } as never)
        expect(p).toEqual({ person: 'James', note: 'top corner', title: 'Goal · James · top corner' })
    })
    it('should leave person and note undefined when absent', () => {
        expect(eventRowParts({ type: 'save' })).toEqual({ person: undefined, note: undefined, title: 'Save' })
    })
})
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run src/utils/eventRow.test.ts` → FAIL (`sub` present / `note` missing).

- [ ] **Step 3: Implement**

```ts
import type { MatchEvent } from '../types'
import { controlLabel, shortNote } from './eventTypes'

export interface EventRowParts {
    /** Scorer / person, shown beside the icon in the shirt font. */
    person: string | undefined
    /** Short note, shown inline after the name (muted, truncated). */
    note: string | undefined
    /** Everything on one line, for the tooltip. */
    title: string
}

/** The text pieces of an event-log row: person and note (assists are not shown in the rail). */
export function eventRowParts(e: Pick<MatchEvent, 'type' | 'pen' | 'scorer' | 'notes'>): EventRowParts {
    const person = e.scorer?.trim() || undefined
    const note = shortNote(e.notes) || undefined
    const title = [controlLabel(e), person, note].filter(Boolean).join(' · ')
    return { person, note, title }
}
```

- [ ] **Step 4: Run** — same command → PASS. `npx tsc -b --noEmit` will now fail in `EventLog.tsx` (uses `sub`); that is fixed in A2 — commit A1 and A2 together if you prefer, but run A1's test first.

- [ ] **Step 5: Commit** — `git add src/utils/eventRow.ts src/utils/eventRow.test.ts && git commit -m "feat(rail): eventRowParts gives person + note, no assist"` (+ trailers)

### Task A2: Slim main row + expanding action row

**Files:**
- Create: `src/components/EventActions.tsx`
- Modify: `src/components/EventLog.tsx` (EventRow, MarkerRow, FileSlot, list rendering, onKeyDown, onSelect)
- Test: `src/components/EventLog.test.tsx` (update assist / V-tag / touch-tap expectations; add new cases)

**Interfaces:**
- Consumes: `eventRowParts` from A1.
- Produces (Part B relies on this): `EventActions` props
  ```ts
  export interface EventActionsProps {
      event: MatchEvent
      touch: boolean
      onToggleReplay: () => void
      onFraming: () => void
      onEdit: () => void
      onRemove: () => void
      /** Part B passes this; when absent the Download button is not rendered. */
      download?: ReactNode
  }
  ```
  and a CSS slot class `event-actions__download` wrapper so Part B drops its button/popover in.

Behaviour (from the spec §1):
- Main row: clock · team dot · icon · name (or type label) · note (inline, `event-row__note`, muted, single line, ellipsis) · score · ▶ Watch. No assist, no `V1/V2` tag (`FileSlot` renders only the "file missing" warning; drop the `fileTag`/`fileSlot` props and the `files.length > 1` computation).
- The selected row renders `<EventActions>` as a second `<div className="event-actions" role="group" aria-label="Event actions">` **inside the same `<li>`** (so `role="option"` rows stay the list's children), spanning the full grid width (`grid-column: 1 / -1`).
- Actions: ↻ Replay (`aria-pressed`, non-marker only) · ⌖ Framing (only when replay is on; desktop and touch) · ✎ Edit (`editEvent(id)`) · [download slot] · × Delete. Marker rows: Edit · Delete.
- Buttons: icon + text label (`<span className="event-actions__label">Replay</span>`), labels hidden by a container query when the rail is narrow (keep `aria-label`/`title`). Buttons are tabbable (no `tabIndex={-1}`), ≥ 44 px tall on touch.
- Selection: click / ↑↓ / Home / End / fresh tag selects (already) → expanded. **Touch:** `onSelect` no longer calls `editEvent` (remove the `if (coarse) ... editEvent` line); Edit is in the action row.
- Esc in the focused log: if a row is selected → clear selection (collapse) and keep focus on the log; second Esc → blur (today's behaviour).
- Remove the inline ↻ ⌖ × buttons from the main row (they move to the action row). Keyboard shortcuts R / ⌫ / E / T / N / Enter unchanged.
- Clicks inside the action row must not re-trigger row selection handlers that would interfere (stopPropagation on each button, as the current row buttons do).
- Inline edit (scorer/team/note/time) still works on the selected row; while an inline field is open the action row stays rendered and keys typed in the field never reach the log handler (`isTyping` guard already does this — keep it).

- [ ] **Step 1: Write failing component tests** (add to `EventLog.test.tsx`; update the three existing tests that assert `Assist: Joe`, `.row-file`/`V2`, and "touch tap opens the edit sheet")

```tsx
describe('EventLog action row', () => {
    const goal = (id: string, t: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', team: 'Whites', scorer: 'James', ...extra })

    it('should show no assist and no file tag in the row', () => {
        setup([goal('a', 100, { assist: 'Joe', notes: 'top corner' })], { files: [vf('a.mp4'), vf('b.mp4')], cumulativeOffsets: [0, 600] })
        render(<EventLog />)
        const [row] = rows()
        expect(row).not.toHaveTextContent('Assist')
        expect(row.querySelector('.row-file')).toBeNull()
        expect(row.querySelector('.event-row__note')).toHaveTextContent('top corner')
    })

    it('should expand only the selected row', async () => {
        setup([goal('a', 100), goal('b', 200)])
        render(<EventLog />)
        expect(screen.queryByRole('group', { name: 'Event actions' })).toBeNull()
        await userEvent.click(rows()[0])
        expect(within(rows()[0]).getByRole('group', { name: 'Event actions' })).toBeInTheDocument()
        await userEvent.click(rows()[1])
        expect(within(rows()[0]).queryByRole('group', { name: 'Event actions' })).toBeNull()
        expect(within(rows()[1]).getByRole('group', { name: 'Event actions' })).toBeInTheDocument()
    })

    it('should toggle replay, open edit and delete from the action row', async () => {
        setup([goal('a', 100), goal('b', 200)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        const actions = within(rows()[0]).getByRole('group', { name: 'Event actions' })
        await userEvent.click(within(actions).getByRole('button', { name: /replay/i }))
        expect(byId('a')?.replay).toBe(false)
        await userEvent.click(within(actions).getByRole('button', { name: /edit/i }))
        expect(useAppState.getState()).toMatchObject({ panel: 'event', editingEventId: 'a' })
        await userEvent.click(within(actions).getByRole('button', { name: /delete/i }))
        expect(byId('a')).toBeUndefined()
    })

    it('should show Framing only while the replay is on', async () => {
        setup([goal('a', 100, { replay: false })])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        expect(within(rows()[0]).queryByRole('button', { name: /framing/i })).toBeNull()
    })

    it('should give marker rows only Edit and Delete', async () => {
        setup([kickOff(0)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        const actions = within(rows()[0]).getByRole('group', { name: 'Event actions' })
        expect(within(actions).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Edit details', 'Delete event'])
    })

    it('should expand on a touch tap instead of opening the edit sheet', async () => {
        setCoarsePointer(true)
        setup([goal('a', 100)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        expect(useAppState.getState().panel).not.toBe('event')
        expect(within(rows()[0]).getByRole('group', { name: 'Event actions' })).toBeInTheDocument()
        setCoarsePointer(false)
    })

    it('should collapse on Esc and keep focus in the log', async () => {
        setup([goal('a', 100)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        log().focus()
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('group', { name: 'Event actions' })).toBeNull()
        expect(log()).toHaveFocus()
    })

    it('should not delete the event when Backspace is typed in an open note field (review focus 1)', async () => {
        setup([goal('a', 100, { notes: 'abc' })])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        log().focus()
        await userEvent.keyboard('n')
        const input = screen.getByRole('textbox', { name: 'Note' })
        await userEvent.type(input, '{Backspace}')
        expect(byId('a')).toBeDefined()
        expect(within(rows()[0]).getByRole('group', { name: 'Event actions' })).toBeInTheDocument()
    })

    it('should still open the action row for an unlinked event (review focus 2)', async () => {
        setup([goal('a', 100, { unlinked: true, sourceFileKey: 'gone.mp4' })])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        expect(within(rows()[0]).getByRole('group', { name: 'Event actions' })).toBeInTheDocument()
        expect(within(rows()[0]).getByRole('button', { name: 'Watch' })).toBeDisabled()
    })
})
```
(`setCoarsePointer` exists in `src/test/pointer.ts`; check its exact signature before use and adapt.)

- [ ] **Step 2: Run** — `npx vitest run src/components/EventLog.test.tsx` → new tests FAIL.

- [ ] **Step 3: Implement `EventActions.tsx`**

```tsx
import type { ReactNode } from 'react'
import type { MatchEvent } from '../types'
import { isMarker } from '../utils/eventTypes'
import { wantsReplay } from '../utils/replays'

export interface EventActionsProps {
    event: MatchEvent
    touch: boolean
    onToggleReplay: () => void
    onFraming: () => void
    onEdit: () => void
    onRemove: () => void
    /** The clip download control (Part B); not rendered when absent. */
    download?: ReactNode
}

/** The selected row's second line: replay, framing, edit, download, delete. */
export function EventActions({ event: e, touch, onToggleReplay, onFraming, onEdit, onRemove, download }: EventActionsProps) {
    const stop = (ev: React.SyntheticEvent): void => ev.stopPropagation()
    const marker = isMarker(e)
    const replay = !marker && wantsReplay(e)
    const btn = `act-btn${touch ? ' act-btn--touch' : ''}`
    return (
        <div className="event-actions" role="group" aria-label="Event actions" onClick={stop}>
            {!marker && (
                <button type="button" className={`${btn} act-btn--replay`} aria-label="Replay" aria-pressed={replay}
                    title={replay ? 'Slow-mo replay on (R)' : 'Slow-mo replay off (R)'} onClick={onToggleReplay}>
                    <span aria-hidden="true">↻</span><span className="event-actions__label">Replay</span>
                </button>
            )}
            {replay && (
                <button type="button" className={btn} aria-label="Replay framing" title="Replay framing (zoom to the goal)" onClick={onFraming}>
                    <span aria-hidden="true">⌖</span><span className="event-actions__label">Framing</span>
                </button>
            )}
            <button type="button" className={btn} aria-label="Edit details" title="Edit details (E person · T team · N note)" onClick={onEdit}>
                <span aria-hidden="true">✎</span><span className="event-actions__label">Edit</span>
            </button>
            {!marker && download ? <span className="event-actions__download">{download}</span> : null}
            <button type="button" className={`${btn} act-btn--delete`} aria-label="Delete event" title="Delete (⌫)" onClick={onRemove}>
                <span aria-hidden="true">×</span><span className="event-actions__label">Delete</span>
            </button>
        </div>
    )
}
```

- [ ] **Step 4: Update `EventLog.tsx`**
  - `EventRow`: use `parts.note` → `{parts.note && <span className="event-row__note" onDoubleClick={(ev) => { stop(ev); onEdit('notes') }}>{parts.note}</span>}` inside `event-row__content` after `event-row__main` (same line, CSS makes it inline). Remove the `event-row__sub` block, the inline ↻ ⌖ × buttons and the gaps. End cluster: score · `FileSlot` (warning only) · Watch.
  - After the existing children of the `<li>` (both EventRow and MarkerRow), render `{selected && <EventActions event={e} touch={touch} onToggleReplay={onToggleReplay} onFraming={onFraming} onEdit={() => useAppState.getState().editEvent(e.id)} onRemove={onRemove} />}` (MarkerRow passes no-op replay/framing; EventActions hides them for markers).
  - `FileSlot`: `({ unlinked, fileKey })` → warning tag or `null`. Delete `fileTag`/`fileSlot` props and their computation in the list.
  - `onSelect`: `setSelectedId(e.id)` only (remove the coarse `editEvent` call).
  - `onKeyDown` `'Escape'`: `if (selectedId) { setSelectedId(null) } else { rootRef.current?.blur() }`.
  - Update the `EventRowProps.touch` doc comment ("Touch: larger icon and action buttons").

- [ ] **Step 5: CSS in `src/App.css`** (tokens only; keep existing grid columns for the main row)

```css
.event-row .clock, .event-row .row-score { font-size: 12px; }
.event-row .ev-person { font-size: calc(var(--row-name-size, 15px) - 1px); }
.event-row__content { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.event-row__note { color: var(--sh-muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.event-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0 2px calc(var(--clock-ch, 5ch) + 30px); }
.act-btn { display: inline-flex; align-items: center; gap: 4px; min-height: 30px; padding: 0 8px; border-radius: 6px;
  border: 1px solid var(--sh-line); background: transparent; color: var(--sh-text); font-size: 12px; }
.act-btn:hover { background: var(--sh-surface-2); }
.act-btn[aria-pressed="true"] { border-color: var(--sh-text); }
.act-btn--touch { min-height: 44px; min-width: 44px; font-size: 14px; }
.act-btn--delete:hover { color: var(--sh-rec); }
@container (max-width: 300px) { .event-actions__label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); } }
```
Check the existing `.event-row` rule (`src/App.css:278`) for its current font sizes/variables and `--row-name-size`; adjust selectors to the real ones (the name may be sized on `.ev-person` directly). Confirm the rail is a container (`container-type`) — `35fcff2` added a narrow-rail container query; reuse its container name. Verify `node scripts/check-contrast.mjs` still passes and `src/utils/limeUsage.test.ts` is green (no lime added).

- [ ] **Step 6: Run** — `npx vitest run src/components/EventLog.test.tsx src/utils` → PASS; full checks (Global Constraints).

- [ ] **Step 7: Screenshots** — dev server on 5181 with generated media (2 files, events incl. a goal with a note, a save, Kick off, an unlinked event), select a row: 390×844, 844×390, 834×1194 (touch emulation on the phone/tablet sizes), 1280×800, 1440×900, dark and light. Look at each: action row aligned under the icon column, no overflow, labels hidden when narrow, ≥ 44 px targets on touch.

- [ ] **Step 8: Commit** — `git add -A src && git commit -m "feat(rail): slim rows (no assist/file tag), selected row expands into an action row"` (+ trailers)

---

# Part B — Clip download (branch `feat/clip-download`, worktree `.claude/worktrees/clip-download`)

Tasks B1–B5 touch no rail code and can start before Part A merges. B6 needs Part A merged into `main`; rebase onto `main` first.

### Task B1: `clipFileName`

**Files:**
- Create: `src/utils/clipName.ts`, `src/utils/clipName.test.ts`

**Interfaces:**
- Produces: `clipFileName(args: { event: Pick<MatchEvent, 'type' | 'pen' | 'scorer'>; minute: number | null; home?: string; away?: string; preview?: boolean }): string`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { clipFileName } from './clipName'

describe('clipFileName', () => {
    it('should join initials, minute, type and person, lower-case ASCII', () => {
        expect(clipFileName({ event: { type: 'goal', scorer: 'DJ' }, minute: 13, home: 'HAW', away: 'LIO' })).toBe('haw-lio-13-goal-dj.mp4')
    })
    it('should slug pen goals, own goals and accents', () => {
        expect(clipFileName({ event: { type: 'goal', pen: true, scorer: 'Zoë Ö' }, minute: 44, home: 'HAW', away: 'LIO' })).toBe('haw-lio-44-pen-goal-zoe-o.mp4')
        expect(clipFileName({ event: { type: 'own_goal', scorer: 'Ade' }, minute: 30, home: 'A', away: 'B' })).toBe('a-b-30-own-goal-ade.mp4')
    })
    it('should fall back to clip- without teams, and drop missing minute/person', () => {
        expect(clipFileName({ event: { type: 'save' }, minute: null })).toBe('clip-save.mp4')
    })
    it('should mark preview-quality clips', () => {
        expect(clipFileName({ event: { type: 'highlight' }, minute: 5, preview: true })).toBe('clip-5-highlight-preview.mp4')
    })
})
```

- [ ] **Step 2: Run** `npx vitest run src/utils/clipName.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import type { MatchEvent } from '../types'

const TYPE_SLUG: Record<MatchEvent['type'], string> = {
    goal: 'goal', own_goal: 'own-goal', penalty_conceded: 'pen-conceded', penalty_missed: 'pen-missed',
    highlight: 'highlight', foul: 'foul', save: 'save', kick_off: 'kick-off', half_time: 'half-time', final_whistle: 'final-whistle',
}

const slug = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** A clip's download name: `haw-lio-13-goal-dj.mp4` (teams' initials, match minute, type, person). */
export function clipFileName(a: { event: Pick<MatchEvent, 'type' | 'pen' | 'scorer'>; minute: number | null; home?: string; away?: string; preview?: boolean }): string {
    const type = a.event.type === 'goal' && a.event.pen ? 'pen-goal' : TYPE_SLUG[a.event.type]
    const parts = [
        ...(a.home && a.away ? [slug(a.home), slug(a.away)] : ['clip']),
        ...(a.minute !== null ? [String(a.minute)] : []),
        type,
        ...(a.event.scorer?.trim() ? [slug(a.event.scorer)] : []),
        ...(a.preview ? ['preview'] : []),
    ].filter(Boolean)
    return `${parts.join('-')}.mp4`
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(clip): clip file names` (+ trailers)

### Task B2: Caption only chosen events, optionally without the score

**Files:**
- Modify: `src/graphics/plan.ts` (`buildGraphicsSpec` args + caption loop)
- Test: `src/graphics/plan.test.ts`

**Interfaces:**
- Produces: `buildGraphicsSpec(args: { …existing…; captionEvents?: ReadonlySet<string>; captionScore?: boolean; cards?: boolean })` — `captionEvents` limits which events get captions (default: all); `captionScore === false` builds captions with no `bug`; `cards === false` skips title/full-time cards even when `settings.cards` is on (default true).

- [ ] **Step 1: Failing tests** (use the file's existing fixtures/helpers for teams, cuts, settings; names below are illustrative — mirror the existing tests' setup)

```ts
describe('buildGraphicsSpec clip options', () => {
    it('should caption only the chosen event but score it from all events', () => {
        // events: goal A (Whites) at 100 s, goal B (Colours) at 105 s, both inside one cut 90–115 s
        const spec = buildGraphicsSpec({ events, teams, cuts, cumulativeOffsets: [0], settings: { ...settings, lowerThirds: true }, matchday: 'M', captionEvents: new Set(['B']) })
        const captions = spec.overlays.filter((o) => o.kind === 'caption')
        expect(captions).toHaveLength(1)
        expect(captions[0].label).toContain('Caption')
        expect(captions[0].kind === 'caption' && captions[0].spec.bug?.text).toBe('1–1')
    })
    it('should leave the score out when captionScore is false', () => {
        const spec = buildGraphicsSpec({ events, teams, cuts, cumulativeOffsets: [0], settings: { ...settings, lowerThirds: true }, matchday: 'M', captionScore: false })
        expect(spec.overlays.every((o) => o.kind !== 'caption' || !o.spec.bug)).toBe(true)
    })
    it('should skip cards when cards is false', () => {
        const spec = buildGraphicsSpec({ events, teams, cuts, cumulativeOffsets: [0], settings: { ...settings, cards: true }, matchday: 'M', cards: false })
        expect(spec.intro).toBeUndefined()
        expect(spec.outro).toBeUndefined()
    })
})
```
Check `bugFor`'s `text` format in `plan.ts` (en dash vs hyphen) and assert the real value.

- [ ] **Step 2: Run** `npx vitest run src/graphics/plan.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `buildGraphicsSpec`:
  - destructure `captionEvents`, `captionScore = true`, `cards: wantCards = true`;
  - `if (settings.cards && both && wantCards) Object.assign(spec, cards(...))`;
  - in the caption loop: `if (!wantsLowerThird(e) || (captionEvents && !captionEvents.has(e.id))) continue`;
  - score argument: `captionScore && both ? (after.get(e.id) ?? scoreAt(...)) : undefined`.
  The interruption logic (`a.durationSec = b.startSec - a.startSec`) only sees captioned events, so a non-captioned neighbour no longer cuts the chosen caption short — that is intended for clips.

- [ ] **Step 4: Run** → PASS (and the whole `src/graphics` folder). **Step 5: Commit** `feat(clip): caption chosen events, optional score, optional cards` (+ trailers)

### Task B3: Shooot sting outro

**Files:**
- Modify: `src/graphics/types.ts` (`StingSpec`, `outro` union), `src/graphics/layout.ts` (`STING_SEC`, `stingFrame`), `src/graphics/painters.ts` (sting card), `src/graphics/paint.ts` (`PaintAssets.wordmark`), `src/graphics/assets.ts` (`loadWordmark`), `src/graphics/prepare.ts` (load wordmark when needed), `src/utils/exportPlans.ts` (`cardsSec` counts the sting as `STING_SEC`)
- Create: `src/graphics/sting.ts` (`paintSting`), `public/brand/shooot-wordmark.svg` (copy of `brand/shooot/assets/wordmark-on-dark.svg`)
- Test: `src/graphics/layout.test.ts` (or `sting.test.ts`), `src/graphics/painters.test.ts`

**Interfaces:**
- Produces: `type StingSpec = { kind: 'sting' }`; `GraphicsSpec.outro?: CardSpec | StingSpec`; `isSting(o: CardSpec | StingSpec | undefined): o is StingSpec`; `STING_SEC = 3.5`; `stingFrame(t: number, d: number): { alpha: number; scale: number }`; `paintSting(ctx, t, d, assets)`; `loadWordmark(): Promise<ImageBitmap | null>`.

- [ ] **Step 1: Failing tests**

```ts
// src/graphics/sting.test.ts
import { describe, it, expect } from 'vitest'
import { STING_SEC, stingFrame } from './layout'
import { isSting } from './types'

describe('stingFrame', () => {
    it('should fade and scale in over 0.6 s, hold, and fade out over the last 0.5 s', () => {
        expect(stingFrame(0, STING_SEC)).toEqual({ alpha: 0, scale: 0.92 })
        expect(stingFrame(0.6, STING_SEC)).toEqual({ alpha: 1, scale: 1 })
        expect(stingFrame(2, STING_SEC)).toEqual({ alpha: 1, scale: 1 })
        expect(stingFrame(STING_SEC, STING_SEC).alpha).toBe(0)
        expect(stingFrame(STING_SEC - 0.25, STING_SEC).alpha).toBeCloseTo(0.5, 5)
    })
})
describe('isSting', () => {
    it('should tell the sting from a card', () => {
        expect(isSting({ kind: 'sting' })).toBe(true)
        expect(isSting(undefined)).toBe(false)
    })
})
```
And in `painters.test.ts`: `toRenderGraphics({ overlays: [], outro: { kind: 'sting' } }, { logo: null, wordmark: null })` gives `outro.label === 'Shooot sting'`, `outro.durationSec === 3.5`, and **no** `fade` (it animates per frame).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

```ts
// layout.ts
export const STING_SEC = 3.5
const STING_IN = 0.6
const STING_OUT = 0.5
const easeOut = (x: number): number => 1 - (1 - x) ** 3
/** The sting's wordmark: eases in (fade + 0.92 → 1 scale) over 0.6 s, holds, fades out over the last 0.5 s. */
export function stingFrame(t: number, d: number): { alpha: number; scale: number } {
    const inP = easeOut(clamp01(t / STING_IN))
    const out = clamp01((d - t) / STING_OUT)
    return { alpha: Math.min(inP, out), scale: 0.92 + 0.08 * inP }
}
```
(`clamp01` already exists in layout.ts; round in tests with `toBeCloseTo` if floating error appears.)

```ts
// types.ts
export type StingSpec = { kind: 'sting' }
export const isSting = (o: CardSpec | StingSpec | undefined): o is StingSpec => !!o && 'kind' in o && o.kind === 'sting'
// GraphicsSpec: outro?: CardSpec | StingSpec
```

```ts
// sting.ts
import { C } from './themes/shooot/brandColors'
import { stingFrame } from './layout'
import type { Ctx, PaintAssets } from './paint'

/** The end sting: Night Turf ground with the Shooot wordmark easing in and out (brand mark, same in every theme). */
export function paintSting(ctx: Ctx, t: number, d: number, assets: PaintAssets): void {
    const { width: W, height: H } = ctx.canvas
    ctx.fillStyle = C.ground
    ctx.fillRect(0, 0, W, H)
    const mark = assets.wordmark
    if (!mark) return
    const { alpha, scale } = stingFrame(t, d)
    const w = W * 0.42 * scale
    const h = w * (mark.height / mark.width)
    ctx.globalAlpha = alpha
    ctx.drawImage(mark, (W - w) / 2, (H - h) / 2, w, h)
    ctx.globalAlpha = 1
}
```

```ts
// painters.ts — in toRenderGraphics
...(spec.outro ? { outro: isSting(spec.outro) ? sting(assets) : card(spec.outro, 'Full-time card', assets, theme) } : {}),
// helper
function sting(assets: PaintAssets) {
    return { label: 'Shooot sting', durationSec: STING_SEC, paint: (ctx: OffscreenCanvasRenderingContext2D, t: number) => paintSting(ctx, t, STING_SEC, assets) }
}
```

```ts
// paint.ts
export type PaintAssets = { logo: ImageBitmap | null; wordmark?: ImageBitmap | null }
// assets.ts
export const WORDMARK_URL = '/brand/shooot-wordmark.svg'
/** The Shooot wordmark for the end sting, rasterised at 2048 px wide (SVG → bitmap), or null if it cannot load. */
export async function loadWordmark(): Promise<ImageBitmap | null> {
    try {
        const img = new Image()
        img.src = WORDMARK_URL
        await img.decode()
        const w = 2048
        const h = Math.round(w * (img.naturalHeight / img.naturalWidth))
        return await createImageBitmap(img, { resizeWidth: w, resizeHeight: h })
    } catch { return null }
}
// prepare.ts — in prepareSpec
const wordmark = isSting(spec.outro) ? await loadWordmark() : null
return toRenderGraphics(spec, { logo, wordmark })
// exportPlans.ts
const cardsSec = (spec: GraphicsSpec | undefined): number => (spec?.intro ? CARD_SEC : 0) + (spec?.outro ? (isSting(spec.outro) ? STING_SEC : CARD_SEC) : 0)
```
Also update any `spec.outro` consumer that assumes `CardSpec` (`grep -rn "\.outro" src`) — e.g. a preview/card renderer — to skip or handle the sting. Existing component tests mock `../graphics/assets`; add `loadWordmark: vi.fn(async () => null)` to those mocks where `prepareSpec` runs (`grep -rln "graphics/assets'" src --include=*.test.tsx`).

- [ ] **Step 4: Run** `npx vitest run src/graphics src/utils/exportPlans.test.ts` → PASS. **Step 5: Commit** `feat(clip): Shooot sting outro card` (+ trailers)

### Task B4: `clipExport`

**Files:**
- Modify: `src/utils/exportPlans.ts`
- Test: `src/utils/exportPlans.test.ts`

**Interfaces:**
- Consumes: B1 `clipFileName`, B2 options, B3 `StingSpec`.
- Produces:
  ```ts
  export type ClipOptions = { replay: boolean; score: boolean }
  export function clipExport(s: ExportState, eventId: string, opts: ClipOptions, quality: RenderQuality): ExportPlan | null
  ```
  `null` when the event is missing, a marker, or unlinked. `finish` gains a `kind: 'highlights' | 'fullMatch' | 'clip'` and an optional `outputName` override.

- [ ] **Step 1: Failing tests** (reuse the file's existing `ExportState` fixture builder)

```ts
describe('clipExport', () => {
    // files: a.mp4 (600 s), b.mp4 (600 s); offsets [0, 600]; teams Whites/Colours with initials HAW/LIO;
    // events: kick off at 0; goal G1 (Whites, DJ) at file 0 100 s; goal G2 (Colours) at file 0 105 s; goal G3 at file 1 3 s
    it('should cut only that event with its padding, then its replay', () => {
        const p = clipExport(state, 'G1', { replay: true, score: true }, 'full')!
        expect(p.cuts.filter((c) => (c.speed ?? 1) === 1)).toEqual([{ sourceIndex: 0, startSec: 90, endSec: 104 }])
        expect(p.cuts.some((c) => (c.speed ?? 1) < 1)).toBe(true)
    })
    it('should leave the replay out when the option is off', () => {
        expect(clipExport(state, 'G1', { replay: false, score: true }, 'full')!.cuts.every((c) => (c.speed ?? 1) === 1)).toBe(true)
    })
    it('should caption only that event even with a neighbour inside its padding (review focus 4)', () => {
        const spec = clipExport(state, 'G1', { replay: false, score: true }, 'full')!.spec!
        const captions = spec.overlays.filter((o) => o.kind === 'caption')
        expect(captions).toHaveLength(1)
        expect(captions[0].label).toContain('DJ')
    })
    it('should split a clip across the file boundary and caption the part with the event (review focus 3)', () => {
        const p = clipExport(state, 'G3', { replay: false, score: true }, 'full')!
        expect(p.cuts.map((c) => c.sourceIndex)).toEqual([0, 1])
        const captions = p.spec!.overlays.filter((o) => o.kind === 'caption')
        expect(captions.every((o) => p.cuts[o.cutIndex].sourceIndex === 1)).toBe(true)
    })
    it('should end with the sting and have no title or full-time card', () => {
        const p = clipExport({ ...state, graphics: { ...state.graphics, cards: true } }, 'G1', { replay: false, score: true }, 'full')!
        expect(p.spec?.intro).toBeUndefined()
        expect(p.spec?.outro).toEqual({ kind: 'sting' })
    })
    it('should drop the score from the caption when the option is off', () => {
        const spec = clipExport(state, 'G1', { replay: false, score: false }, 'full')!.spec!
        expect(spec.overlays.every((o) => o.kind !== 'caption' || !o.spec.bug)).toBe(true)
    })
    it('should name the file from teams, minute, type and person', () => {
        expect(clipExport(state, 'G1', { replay: false, score: true }, 'full')!.outputName).toBe('haw-lio-2-goal-dj.mp4')
    })
    it('should refuse markers, unknown and unlinked events', () => {
        expect(clipExport(state, 'ko', { replay: true, score: true }, 'full')).toBeNull()
        expect(clipExport(state, 'nope', { replay: true, score: true }, 'full')).toBeNull()
    })
})
```
(Minute for 100 s after a kick-off at 0 is `matchMinute(100, 0)` — check its definition in `utils/matchClock.ts` and assert the real value; the example assumes minute 2.)

- [ ] **Step 2: Run** `npx vitest run src/utils/exportPlans.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
export type ClipOptions = { replay: boolean; score: boolean }

export function clipExport(s: ExportState, eventId: string, opts: ClipOptions, quality: RenderQuality): ExportPlan | null {
    const linked = linkedEvents(s.events)
    const event = linked.find((e) => e.id === eventId)
    if (!event || isMarker(event)) return null
    const segments = mergeOverlappingGoalSegments([event], s.cumulativeOffsets, s.lengthBeforeGoalSec, s.lengthAfterGoalSec)
    const replay = opts.replay && wantsReplay(event) ? replayOptionsFor({ ...s, events: [event] }) : undefined
    const cuts = buildRenderPlan(segments, s.files.map((f) => f.durationSec ?? Infinity), replay)
    const planned = buildGraphicsSpec({
        events: linked, teams: s.teams, cuts, cumulativeOffsets: s.cumulativeOffsets, settings: s.graphics, matchday: matchday(s),
        captionEvents: new Set([event.id]), captionScore: opts.score, cards: false,
    })
    const spec: GraphicsSpec = { ...planned, outro: { kind: 'sting' } }
    const kickOff = markerGlobalSec(linked, s.cumulativeOffsets, 'kick_off')
    const abs = (s.cumulativeOffsets[event.sourceFileIndex ?? 0] ?? 0) + event.matchTimeSec
    const [home, away] = s.teams.length >= 2 ? [teamBadge(s.teams[0]).initials, teamBadge(s.teams[1]).initials] : []
    const outputName = clipFileName({ event, minute: kickOff === null ? null : matchMinute(abs, kickOff), home, away, preview: quality === 'preview' })
    return finish('clip', quality, s, cuts, spec, outputName.replace(/\.mp4$/, ''), false, outputName)
}
```
Adjust `finish(kind, quality, s, cuts, spec, base, resumable, outputName?)` so that when `outputName` is given it is used as-is (no `-preview` suffix added twice). Imports: `isMarker` (`./eventTypes`), `wantsReplay` (`./replays`), `markerGlobalSec`, `matchMinute` (`./matchClock` — confirm `markerGlobalSec` lives there; `graphics/plan.ts` imports it), `teamBadge` (`../graphics/teamStyle`), `clipFileName` (`./clipName`). If `replayOptionsFor` needs all events for the attack side (Half time swap), pass `{ ...s, events: linked }` instead and filter is unnecessary — check `utils/attack.ts` and keep the half-time logic correct.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(clip): clipExport plan (one event, optional replay/score, sting)` (+ trailers)

### Task B5: `'clip'` job kind and remembered clip options

**Files:**
- Modify: `src/render/renderJob.ts` (`JobKind`), `src/components/RenderStatus.tsx` (`NAMES`), `src/components/RenderChip.tsx` (clicking the chip for a clip job opens the Export drawer on the Highlights tab), `src/state.ts` (`clipOptions`, setter, persist + migration)
- Test: `src/state.test.ts` (or the existing persistence/migration test file), `src/components/RenderStatus.test.tsx`

**Interfaces:**
- Produces: `JobKind = 'highlights' | 'fullMatch' | 'clip'`; store `clipOptions: { score: boolean; replay: boolean }` (default `{ score: true, replay: true }`), `setClipOptions(patch: Partial<ClipOptions>): void`.

- [ ] **Step 1: Failing tests**

```ts
it('should default clip options to score and replay on, and remember changes', () => {
    expect(useAppState.getState().clipOptions).toEqual({ score: true, replay: true })
    useAppState.getState().setClipOptions({ score: false })
    expect(useAppState.getState().clipOptions).toEqual({ score: false, replay: true })
})
it('should migrate older saved state with default clip options', () => {
    // call the persist migrate the way the existing migration tests do (find them: grep -n "migrate" src/*.test.ts)
    expect(migrated.clipOptions).toEqual({ score: true, replay: true })
})
```
RenderStatus: a running job of kind `'clip'` shows "Rendering clip · 40%".

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**: add `'clip'` to `JobKind`; `NAMES.clip = 'clip'`; `RenderChip` maps `job.kind === 'clip' ? 'highlights' : job.kind` when calling `setExportTab`; store field + setter; add `clipOptions` to `partialize`; bump `version` to the next free number N; migration `if (version < N) state.clipOptions = { score: true, replay: true }`. `useSavedJob` only ever loads resumable jobs; clips are not resumable — no change there.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(clip): clip job kind, remembered clip options` (+ trailers)

### Task B6: Download control in the action row

Rebase onto `main` after Part A is merged (`git fetch && git rebase main`).

**Files:**
- Create: `src/components/ClipDownload.tsx`, `src/components/ClipDownload.test.tsx`
- Modify: `src/components/EventLog.tsx` (pass `download={<ClipDownload event={e} />}` to `EventActions` for non-marker rows), `src/components/renderRequest.ts` (`startExport` accepts `'clip'`), `src/App.css` (popover styles)

**Interfaces:**
- Consumes: `EventActions.download` (A2), `clipExport` (B4), `JobKind 'clip'` + `clipOptions` (B5), `startExport`.
- Produces: `ClipDownload({ event }: { event: MatchEvent })`.

Behaviour:
- A ⬇ "Download" `act-btn` that opens a `FloatingPanel` (`label="Download clip"`, `placement="below"`, popover variant; it is already a sheet on phones).
- Inside: ☑ **Score** (only when two teams are set), ☑ **Replay** (only when `wantsReplay(event)`), both bound to `clipOptions`; a primary lime **Download** button.
- Download → `const quality = clipExport(st, id, opts, 'full')?.missing.length ? 'preview' : 'full'`; `const plan = clipExport(st, id, opts, quality)`; `startExport('clip', quality, plan, false)`; close the popover. When the plan is preview quality, show "Full-quality files aren't loaded — this clip uses the preview files." above the button before the click.
- Disabled states (the ⬇ button stays enabled so the popover can explain; the primary Download is disabled with the reason as visible text):
  - a render is running (`useRenderJobs((s) => s.job?.phase === 'running')`): "A render is in progress";
  - `event.unlinked`: "Relink the file first".

- [ ] **Step 1: Failing tests** (mock `../render` and `../graphics/assets` exactly like `RenderHighlights.test.tsx` lines 6–13, plus `loadWordmark`)

```tsx
describe('ClipDownload', () => {
    it('should offer Score and Replay for a goal and start a clip render', async () => {
        // setup store: two teams, one file, goal 'a' at 100 s with replay on, clipOptions default
        render(<ClipDownload event={goal} />)
        await userEvent.click(screen.getByRole('button', { name: 'Download clip' }))
        expect(screen.getByRole('checkbox', { name: 'Score' })).toBeChecked()
        expect(screen.getByRole('checkbox', { name: 'Replay' })).toBeChecked()
        await userEvent.click(screen.getByRole('button', { name: 'Download' }))
        expect(renderJobs().getState().job).toMatchObject({ kind: 'clip' })
    })
    it('should hide Replay for an event without one and Score without teams', async () => {
        // save event (no replay), teams []
        await userEvent.click(screen.getByRole('button', { name: 'Download clip' }))
        expect(screen.queryByRole('checkbox', { name: 'Replay' })).toBeNull()
        expect(screen.queryByRole('checkbox', { name: 'Score' })).toBeNull()
    })
    it('should remember the options', async () => {
        await userEvent.click(screen.getByRole('button', { name: 'Download clip' }))
        await userEvent.click(screen.getByRole('checkbox', { name: 'Score' }))
        expect(useAppState.getState().clipOptions.score).toBe(false)
    })
    it('should not start a second render while one runs (review focus 5)', async () => {
        // put renderJobs into a running job first (start a highlights job with a never-resolving renderReel mock)
        await userEvent.click(screen.getByRole('button', { name: 'Download clip' }))
        expect(screen.getByText('A render is in progress')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
    })
    it('should ask to relink an unlinked event (review focus 2)', async () => {
        render(<ClipDownload event={{ ...goal, unlinked: true }} />)
        await userEvent.click(screen.getByRole('button', { name: 'Download clip' }))
        expect(screen.getByText('Relink the file first')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
    })
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `ClipDownload.tsx` per the behaviour above (one component; `useRef` anchor for `FloatingPanel`; checkboxes are `<label><input type="checkbox" …/> Score</label>`; primary button class `btn-primary`). **Step 4:** wire it in `EventLog.tsx`; update `startExport`'s `kind` type to `JobKind`. **Step 5: Run** all tests → PASS; full checks. **Step 6: Commit** `feat(clip): download clip from the event's action row` (+ trailers)

### Task B7: Real render verification (no code unless a bug is found)

- [ ] Generate media in the scratchpad: (a) 20 s 4K HEVC Main level 6.0, 1 s GOP, AAC 48 kHz (`ffmpeg -f lavfi -i testsrc2=size=3840x2160:rate=30000/1001 -f lavfi -i sine=f=440:sample_rate=48000 -t 20 -c:v libx265 -x265-params keyint=30:min-keyint=30:level-idc=60 -tag:v hvc1 -c:a aac clip4k.mp4`); (b) 20 s 720p H.264.
- [ ] Dev server on 5182; load each file, set two teams, Kick off at 0, a goal at 12 s with a scorer and a note; download the clip four ways: score on/off × replay on/off.
- [ ] For each output: `ffmpeg -v error -i out.mp4 -f null -` prints nothing; `ffprobe` audio and video durations within 0.1 s; extract frames at the caption (event + 1.5 s), in the replay, and at sting +1 s / +3.3 s and look at them (caption with/without score bug, REPLAY tag, wordmark centred on Night Turf, fading).
- [ ] AVFoundation check (QuickTime path): decode each 4K output with an `AVAssetReader` script (or open in QuickTime) — no black frames at the caption splice or the sting.
- [ ] Screenshots of the popover at 390×844, 844×390, 834×1194, 1280×800, 1440×900, dark and light.
- [ ] Delete generated media. Report results honestly (what passed, what was not checked on a real device: real GoPro footage, iPhone).
