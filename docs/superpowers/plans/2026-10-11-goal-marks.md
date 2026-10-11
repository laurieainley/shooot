# Goal marks (A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Match setup, the user marks each goal's post bases, crossbar ends and (optionally) back-of-net floor corners on a
still frame; the marks are saved, set the replay-zoom rectangle, travel with projects, and give B pure geometry
(`ballInGoal`).

**Architecture:** Pure geometry in `src/utils/goalMarks.ts` (+ prompt steps in `src/utils/goalMarkSteps.ts`); store field
`goalMarks` persisted at v18; project export/import and transfer links carry it; a `GoalMarksEditor` component (still
frame, zoom/pan, point placement) opened from the existing `GoalAreasSetup` section.

**Tech Stack:** React 19, TypeScript strict (`erasableSyntaxOnly`), Zustand persist, Vitest + RTL + happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-11-goal-marks-design.md`

## Global Constraints

- Everything in `AGENTS.md` §7 (pure utils with tests, explicit return types, no `any`, one component per file, named exports).
- Persisted shape: version **17 → 18** with migration `goalMarks: null` and a test.
- Points are fractions of the frame (0–1). "Left/right" = as seen in the picture. `team1`/`team2` = the goal that team defends at kick-off.
- Brand: team tones as in `FrameBoxes` (no lime except the **Done** primary button via `btn-primary`; no red). Touch targets ≥ 44 px; text ≥ 14 px on touch; contrast ≥ 4.5:1; `prefers-reduced-motion` respected.
- Copy (exact): buttons **"Mark Whites' goal"**, **"Edit Whites' goal marks"**, **"Clear Whites' goal marks"** (team name via `teamGoalLabel`); prompts **"Click the bottom of the left post"**, **"Click the bottom of the right post"**, **"Click the top of the left post"**, **"Click the top of the right post"**, **"Click the back-left corner of the net on the floor (optional)"**, **"Click the back-right corner of the net on the floor (optional)"**; buttons **"Skip"**, **"Done"**, **"Cancel"**. On touch, "Click" reads "Tap".
- Gates: `npm run test:run`, `npx tsc -b --noEmit`, `npm run build`, `npm run lint` (baseline 12, add none).

## Review Focus

1. **Malformed persisted/imported marks** (missing points, NaN, out of range): normalise drops them; app must not crash. → Task 1/2 tests.
2. **Swap which goal is whose**: marks must swap with the rectangles. → Task 2 test.
3. **Re-marking resets the replay rectangle; dragging the rectangle afterwards keeps the marks.** → Task 2/3 tests.
4. **Far goal with no back corners** must use the goal-line rule, never the footprint. → Task 1 test.
5. **Cancel** leaves the previous marks untouched. → Task 3 test.

---

### Task 1: Geometry and prompt steps (pure)

**Files:** Create `src/utils/goalMarks.ts`, `src/utils/goalMarks.test.ts`, `src/utils/goalMarkSteps.ts`, `src/utils/goalMarkSteps.test.ts`; Modify `src/types.ts`.

**Interfaces (produces):**
```ts
// src/types.ts
export type Pt = { x: number; y: number }
export type GoalMarks = { postL: Pt; postR: Pt; barL: Pt; barR: Pt; backL?: Pt; backR?: Pt }
export type GoalMarksByTeam = { team1?: GoalMarks; team2?: GoalMarks }
// src/utils/goalMarks.ts
export function goalRectFromMarks(m: GoalMarks): CropRect
export function isNearGoal(m: GoalMarks): boolean
export function footprint(m: GoalMarks): Pt[] | null
export function ballInGoal(ball: { cx: number; bottom: number; w: number }, m: GoalMarks, frame: { w: number; h: number }): boolean
export function normaliseGoalMarks(v: unknown): GoalMarksByTeam | null
export function swapGoalMarks(m: GoalMarksByTeam): GoalMarksByTeam
// src/utils/goalMarkSteps.ts
export type MarkKey = 'postL' | 'postR' | 'barL' | 'barR' | 'backL' | 'backR'
export const MARK_STEPS: { key: MarkKey; optional: boolean; prompt: string }[]
export function nextStep(partial: Partial<GoalMarks>, skipped: ReadonlySet<MarkKey>): MarkKey | null
export function promptFor(key: MarkKey, touch: boolean): string
export function isComplete(partial: Partial<GoalMarks>): partial is GoalMarks
```

- [ ] **Step 1: Failing tests** — `src/utils/goalMarks.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ballInGoal, footprint, goalRectFromMarks, isNearGoal, normaliseGoalMarks, swapGoalMarks } from './goalMarks'
import type { GoalMarks } from '../types'

// near goal as in the test footage (4K frame 3840×2160): fractions from user marks
const NEAR: GoalMarks = {
    postL: { x: 3072 / 3840, y: 1285 / 2160 }, postR: { x: 3339 / 3840, y: 1006 / 2160 },
    barL: { x: 3174 / 3840, y: 854 / 2160 }, barR: { x: 3396 / 3840, y: 732 / 2160 },
    backL: { x: 3474 / 3840, y: 1450 / 2160 }, backR: { x: 3586 / 3840, y: 1068 / 2160 },
}
const FAR: GoalMarks = {
    postL: { x: 1023 / 3840, y: 535 / 2160 }, postR: { x: 1216 / 3840, y: 508 / 2160 },
    barL: { x: 1017 / 3840, y: 469 / 2160 }, barR: { x: 1211 / 3840, y: 448 / 2160 },
}
const F = { w: 3840, h: 2160 }

describe('goalRectFromMarks', () => {
    it('should cover every point with a square-in-fractions rectangle inside the frame', () => {
        const r = goalRectFromMarks(NEAR)
        expect(r.w).toBeCloseTo(r.h)
        for (const p of Object.values(NEAR)) { expect(p.x).toBeGreaterThanOrEqual(r.x); expect(p.x).toBeLessThanOrEqual(r.x + r.w); expect(p.y).toBeGreaterThanOrEqual(r.y); expect(p.y).toBeLessThanOrEqual(r.y + r.h) }
        expect(r.x + r.w).toBeLessThanOrEqual(1); expect(r.y + r.h).toBeLessThanOrEqual(1)
    })
})
describe('isNearGoal / footprint', () => {
    it('should treat a tall goal with back corners as near and give its floor polygon', () => {
        expect(isNearGoal(NEAR)).toBe(true)
        expect(footprint(NEAR)).toHaveLength(4)
    })
    it('should treat a small goal or one without back corners as far', () => {
        expect(isNearGoal(FAR)).toBe(false)
        expect(footprint(FAR)).toBeNull()
        const { backL: _l, backR: _r, ...noBack } = NEAR
        expect(isNearGoal(noBack)).toBe(false)
    })
})
describe('ballInGoal', () => {
    it('near: inside the floor footprint and big enough', () => {
        expect(ballInGoal({ cx: 3350, bottom: 1250, w: 60 }, NEAR, F)).toBe(true)
        expect(ballInGoal({ cx: 2900, bottom: 1250, w: 60 }, NEAR, F)).toBe(false)   // in front of the goal line
        expect(ballInGoal({ cx: 3350, bottom: 1250, w: 15 }, NEAR, F)).toBe(false)   // too small: clutter
    })
    it('far: between the posts, behind the goal line and under the bar', () => {
        expect(ballInGoal({ cx: 1120, bottom: 515, w: 14 }, FAR, F)).toBe(true)
        expect(ballInGoal({ cx: 1120, bottom: 540, w: 14 }, FAR, F)).toBe(false)     // in front of the line
        expect(ballInGoal({ cx: 1300, bottom: 515, w: 14 }, FAR, F)).toBe(false)     // outside the posts
        expect(ballInGoal({ cx: 1120, bottom: 440, w: 14 }, FAR, F)).toBe(false)     // above the bar
    })
})
describe('normaliseGoalMarks / swapGoalMarks', () => {
    it('should keep valid goals, drop malformed ones and clamp to the frame', () => {
        const out = normaliseGoalMarks({ team1: { ...FAR, postL: { x: 1.5, y: 0.2 } }, team2: { postL: { x: NaN, y: 0 } } })
        expect(out?.team1?.postL.x).toBe(1)
        expect(out?.team2).toBeUndefined()
        expect(normaliseGoalMarks('nope')).toBeNull()
        expect(normaliseGoalMarks({ team1: { postL: { x: 0.1, y: 0.1 } } })).toBeNull()
    })
    it('should swap teams', () => {
        expect(swapGoalMarks({ team1: NEAR })).toEqual({ team2: NEAR })
    })
})
```
`src/utils/goalMarkSteps.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isComplete, nextStep, promptFor } from './goalMarkSteps'

describe('goal mark steps', () => {
    it('should ask for the required points in order, then the optional ones', () => {
        expect(nextStep({}, new Set())).toBe('postL')
        const p = { x: 0.5, y: 0.5 }
        expect(nextStep({ postL: p, postR: p, barL: p, barR: p }, new Set())).toBe('backL')
        expect(nextStep({ postL: p, postR: p, barL: p, barR: p }, new Set(['backL', 'backR']))).toBeNull()
    })
    it('should word prompts for touch', () => {
        expect(promptFor('postL', false)).toBe('Click the bottom of the left post')
        expect(promptFor('postL', true)).toBe('Tap the bottom of the left post')
        expect(promptFor('backR', false)).toBe('Click the back-right corner of the net on the floor (optional)')
    })
    it('should be complete with the four required points', () => {
        const p = { x: 0.5, y: 0.5 }
        expect(isComplete({ postL: p, postR: p, barL: p })).toBe(false)
        expect(isComplete({ postL: p, postR: p, barL: p, barR: p })).toBe(true)
    })
})
```
Run → FAIL (modules missing).

- [ ] **Step 2: Implement** `src/utils/goalMarks.ts`:
```ts
import type { CropRect, GoalMarks, GoalMarksByTeam, Pt } from '../types'
import { clampRect } from './crop'

const pts = (m: GoalMarks): Pt[] => [m.postL, m.postR, m.barL, m.barR, ...(m.backL ? [m.backL] : []), ...(m.backR ? [m.backR] : [])]

/** Replay zoom box covering the goal: bounding box padded by 30% of the goal width (≥ 0.04), square in frame fractions. */
export function goalRectFromMarks(m: GoalMarks): CropRect {
    const p = pts(m), xs = p.map((q) => q.x), ys = p.map((q) => q.y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const pad = Math.max(0.04, 0.3 * Math.abs(m.postR.x - m.postL.x))
    const side = Math.min(1, Math.max(x1 - x0, y1 - y0) + 2 * pad)
    return clampRect({ x: (x0 + x1) / 2 - side / 2, y: (y0 + y1) / 2 - side / 2, w: side, h: side })
}

const postHeight = (m: GoalMarks): number => (Math.hypot(m.postL.x - m.barL.x, m.postL.y - m.barL.y) + Math.hypot(m.postR.x - m.barR.x, m.postR.y - m.barR.y)) / 2

/** A goal close to the camera: tall in the picture (≥ 12% of the frame height) with the back of the net marked. */
export function isNearGoal(m: GoalMarks): boolean {
    return !!m.backL && !!m.backR && Math.abs(m.postL.y - m.barL.y) >= 0.12
}

export function footprint(m: GoalMarks): Pt[] | null {
    return m.backL && m.backR ? [m.postL, m.postR, m.backR, m.backL] : null
}

function inside(poly: { x: number; y: number }[], x: number, y: number): boolean {
    let c = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j]
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
    }
    return c
}

function distToEdges(poly: { x: number; y: number }[], x: number, y: number): number {
    let d = Infinity
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j], b = poly[i], dx = b.x - a.x, dy = b.y - a.y
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        d = Math.min(d, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)))
    }
    return d
}

/** Is a detected ball (pixel box: centre x, bottom y, width) inside this goal? Near: on the floor inside the net; far: behind the goal line, between the posts, under the bar. */
export function ballInGoal(ball: { cx: number; bottom: number; w: number }, m: GoalMarks, frame: { w: number; h: number }): boolean {
    const P = (q: Pt): { x: number; y: number } => ({ x: q.x * frame.w, y: q.y * frame.h })
    if (isNearGoal(m)) {
        const poly = footprint(m)!.map(P)
        const expected = 0.18 * postHeight(m) * frame.h
        return ball.w >= 0.6 * expected && inside(poly, ball.cx, ball.bottom) && distToEdges(poly, ball.cx, ball.bottom) >= 8
    }
    const a = P(m.postL), b = P(m.postR), c = P(m.barL), d = P(m.barR)
    if (ball.cx < Math.min(a.x, b.x) - 3 || ball.cx > Math.max(a.x, b.x) + 3) return false
    const lineY = a.y + ((b.y - a.y) * (ball.cx - a.x)) / ((b.x - a.x) || 1)
    const barY = c.y + ((d.y - c.y) * (ball.cx - c.x)) / ((d.x - c.x) || 1)
    return ball.bottom <= lineY + 2 && ball.bottom >= barY
}

const isPt = (v: unknown): v is Pt => !!v && typeof v === 'object' && Number.isFinite((v as Pt).x) && Number.isFinite((v as Pt).y)
const clampPt = (p: Pt): Pt => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })

function normaliseOne(v: unknown): GoalMarks | undefined {
    if (!v || typeof v !== 'object') return undefined
    const o = v as Record<string, unknown>
    if (!isPt(o.postL) || !isPt(o.postR) || !isPt(o.barL) || !isPt(o.barR)) return undefined
    const m: GoalMarks = { postL: clampPt(o.postL), postR: clampPt(o.postR), barL: clampPt(o.barL), barR: clampPt(o.barR) }
    if (isPt(o.backL) && isPt(o.backR)) { m.backL = clampPt(o.backL); m.backR = clampPt(o.backR) }
    return m
}

/** Marks from persisted / imported data; malformed goals are dropped; null when none is usable. */
export function normaliseGoalMarks(v: unknown): GoalMarksByTeam | null {
    if (!v || typeof v !== 'object') return null
    const o = v as Record<string, unknown>, out: GoalMarksByTeam = {}
    const t1 = normaliseOne(o.team1), t2 = normaliseOne(o.team2)
    if (t1) out.team1 = t1
    if (t2) out.team2 = t2
    return out.team1 || out.team2 ? out : null
}

export function swapGoalMarks(m: GoalMarksByTeam): GoalMarksByTeam {
    const out: GoalMarksByTeam = {}
    if (m.team2) out.team1 = m.team2
    if (m.team1) out.team2 = m.team1
    return out
}
```
`src/utils/goalMarkSteps.ts`:
```ts
import type { GoalMarks } from '../types'

export type MarkKey = 'postL' | 'postR' | 'barL' | 'barR' | 'backL' | 'backR'
export const MARK_STEPS: { key: MarkKey; optional: boolean; prompt: string }[] = [
    { key: 'postL', optional: false, prompt: 'the bottom of the left post' },
    { key: 'postR', optional: false, prompt: 'the bottom of the right post' },
    { key: 'barL', optional: false, prompt: 'the top of the left post' },
    { key: 'barR', optional: false, prompt: 'the top of the right post' },
    { key: 'backL', optional: true, prompt: 'the back-left corner of the net on the floor (optional)' },
    { key: 'backR', optional: true, prompt: 'the back-right corner of the net on the floor (optional)' },
]

/** The next point to place: the first one neither placed nor skipped; null when done. */
export function nextStep(partial: Partial<GoalMarks>, skipped: ReadonlySet<MarkKey>): MarkKey | null {
    return MARK_STEPS.find((s) => !partial[s.key] && !skipped.has(s.key))?.key ?? null
}

export function promptFor(key: MarkKey, touch: boolean): string {
    const s = MARK_STEPS.find((x) => x.key === key)!
    return `${touch ? 'Tap' : 'Click'} ${s.prompt}`
}

export function isComplete(partial: Partial<GoalMarks>): partial is GoalMarks {
    return !!(partial.postL && partial.postR && partial.barL && partial.barR)
}
```
Add the three types to `src/types.ts`.

- [ ] **Step 3: Run** `npx vitest run src/utils/goalMarks.test.ts src/utils/goalMarkSteps.test.ts` → PASS; tsc clean. (If a far/near expectation is off by a few pixels, fix the geometry, not the test, and say so in the report.)
- [ ] **Step 4: Commit** `feat(goals): goal marks geometry and marking steps`.

---

### Task 2: Store, persistence v18, projects and transfer

**Files:** Modify `src/state.ts`, `src/state.test.ts`, `src/utils/projectTransfer.ts` (+ test), `src/components/applyProject.ts` (+ test), `src/components/ProjectIO.tsx` (+ test), `src/components/GoalAreasSetup.tsx` (swap button only).

**Interfaces:** Consumes Task 1. Produces on `useAppState`: `goalMarks: GoalMarksByTeam | null`, `setGoalMarks(team: GoalTeam, marks: GoalMarks | null): void` (complete marks also set `goalAreas[team] = goalRectFromMarks(marks)`, creating `goalAreas` if null), `setAllGoalMarks(m: GoalMarksByTeam | null): void`.

- [ ] **Step 1: Failing tests** (append to `src/state.test.ts`, follow its reset pattern):
  - setGoalMarks('team1', FAR-like marks) → `goalMarks.team1` stored and `goalAreas.team1` equals `goalRectFromMarks(marks)`; setGoalMarks('team1', null) removes team1 marks and keeps the rectangle.
  - Dragging the rectangle (setGoalAreas with a new team1 rect) keeps the marks.
  - newMatch and clear reset `goalMarks` to null.
  - migrate from v17 → `goalMarks: null`; persisted `partialize` includes `goalMarks`.
  - projectTransfer: `buildTransferPayload` includes `goalMarks`; applyTransferPayload sets them via `normaliseGoalMarks` (malformed → null, no throw).
  - ProjectIO: exported JSON contains `goalMarks`; importing a file with `goalMarks` sets them; importing an old file without them leaves them null.
  - GoalAreasSetup: "Swap which goal is whose" swaps marks too (`swapGoalMarks`).
- [ ] **Step 2: Implement** the store field/actions (initial `null`), `partialize`, `version: 18` and migration
  `if (version < 18) state.goalMarks = normaliseGoalMarks(state.goalMarks)` (which gives null when absent), `newMatch`/`clear`
  reset, `TransferPayload` + `KEYS` + apply, ProjectIO export/import, swap button calls `setAllGoalMarks(swapGoalMarks(marks))`
  alongside the existing area swap.
- [ ] **Step 3: Run** the touched tests, full suite once, tsc, lint → PASS.
- [ ] **Step 4: Commit** `feat(goals): goal marks in the store, projects and transfer links (persist v18)`.

---

### Task 3: Marking editor in Match setup

**Files:** Create `src/components/GoalMarksEditor.tsx`, `src/components/GoalMarksEditor.test.tsx`; Modify `src/components/GoalAreasSetup.tsx` (+ test), `src/App.css`.

**Interfaces:** Consumes Task 1 (`MARK_STEPS`, `nextStep`, `promptFor`, `isComplete`, `footprint`) and Task 2 (`setGoalMarks`, `goalMarks`). Uses `useFrameAt` (same still as Goal areas), `useZoomPan`, `COARSE_QUERY`/`useMediaQuery`, `teamGoalLabel`.

```tsx
interface GoalMarksEditorProps {
    team: GoalTeam
    frame: FrameState            // from useFrameAt in GoalAreasSetup
    initial: GoalMarks | null
    onDone: (marks: GoalMarks) => void
    onCancel: () => void
}
```

Behaviour (each line is a test in `GoalMarksEditor.test.tsx`, happy-dom; simulate clicks on the picture element with
`clientX/clientY` and a mocked `getBoundingClientRect`):
- Shows the prompt for the next step ("Click the bottom of the left post" with a mouse; "Tap …" when `COARSE_QUERY` matches).
- A click on the picture places the current point at the clicked fraction (accounting for zoom/pan) and advances the prompt.
- After the 4 required points the optional prompts appear with a **Skip** button; Skip advances; after both optional steps the prompt line reads "All set — drag a dot to adjust." (plain).
- **Done** is disabled until the 4 required points exist; clicking it calls `onDone` with the marks (optional points only if both placed).
- **Cancel** calls `onCancel` and nothing else (previous marks stay — GoalAreasSetup test).
- Placed dots are buttons (`aria-label` e.g. "Left post bottom"); dragging a dot moves it; arrow keys on a focused dot nudge by 0.002 (Shift: 0.01).
- Starting with `initial` marks shows them and the prompt "All set — drag a dot to adjust."
- Rendering: an SVG overlay in frame-fraction coordinates (`viewBox="0 0 1 1"`, `preserveAspectRatio="none"`) draws the goal line (post bases, thicker), posts and bar (thin), the footprint polygon (translucent) when back corners exist, using the team tone CSS variables used by `FrameBoxes` (no lime/red). Dots get a 44 px hit area (transparent circle or padded button).
- Zoom/pan: wheel and pinch zoom via `useZoomPan` (`zoomAt`), pan with two-finger drag or space+drag; a **Reset zoom** quiet button. (Test: wheel event changes the transform scale.)

`GoalAreasSetup.tsx`: under the boxes, per team goal (that has a box): `Mark <teamGoalLabel>` (no marks) / `Edit <label> marks` + `Clear <label> marks` (marks exist). While an editor is open the FrameBoxes are hidden and the editor replaces them; `onDone` → `setGoalMarks(team, marks)` (which also resets that team's rectangle); `Clear marks` → `setGoalMarks(team, null)`. Tests: buttons per state; Done stores marks and updates the rectangle; Cancel keeps old marks; Clear removes marks only.

- [ ] Steps: failing tests → implement → focused tests, full suite, tsc, lint, build → commit `feat(goals): mark goal posts, bar and net in Match setup`.

---

### Task 4: Verification

- [ ] Gates (tests, tsc, build, lint) with exit codes.
- [ ] Screenshots with a generated test clip (≤ 30 s, 1280×720; draw two simple goal shapes with ffmpeg `drawbox`/`drawgrid` so posts/bar are visible): Match setup Goal areas with **Mark <team>'s goal** buttons; the editor mid-way (prompt + some dots + lines); zoomed in; after Done (rectangle updated, Edit/Clear buttons) — at 390×844, 844×390, 834×1194, 1280×800, 1440×900, dark and light, touch emulation for phone/tablet. Look at every screenshot; fix small layout defects in this feature; report the rest.
- [ ] Round-trip: export a project JSON with marks and import it in a fresh profile; marks restored.
- [ ] Report what was not verified (real phones, real 4K footage).
