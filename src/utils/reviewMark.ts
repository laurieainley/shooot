import type { KeepType } from '../types'
import type { LoopWindow } from './reviewLoop'

/** Where `sec` sits inside the loop window, 0 (start) … 1 (end), clamped. */
export function positionInWindow(sec: number, w: LoopWindow): number {
    const span = w.endAbs - w.startAbs
    if (span <= 0) return 0
    return Math.min(1, Math.max(0, (sec - w.startAbs) / span))
}

/** Inverse of `positionInWindow`: the whole-timeline second under a 0…1 position. */
export function timeAtPosition(frac: number, w: LoopWindow): number {
    return w.startAbs + Math.min(1, Math.max(0, frac)) * (w.endAbs - w.startAbs)
}

export type Tick = { frac: number; major: boolean }

/** Whole-second ticks across the window (every 5th is major); coarser steps when the window is long so they never crowd. */
export function windowTicks(w: LoopWindow): Tick[] {
    const span = w.endAbs - w.startAbs
    if (span <= 0) return []
    const step = span > 90 ? 10 : span > 45 ? 5 : span > 25 ? 2 : 1
    const out: Tick[] = []
    for (let t = Math.ceil(w.startAbs / step) * step; t <= w.endAbs + 1e-9; t += step) {
        out.push({ frac: positionInWindow(t, w), major: step === 1 ? t % 5 === 0 : t % (step * 5) === 0 })
    }
    return out
}

export type LabelAlign = 'start' | 'center' | 'end'
const EDGE = 0.1
const CLOSE = 0.22

/** How a label under a marker at `frac` aligns so it stays inside the bar; `other` (another marker's position) pushes close labels apart. */
export function labelAlign(frac: number, other: number | null = null): LabelAlign {
    if (frac < EDGE) return 'start'
    if (frac > 1 - EDGE) return 'end'
    if (other !== null && Math.abs(frac - other) < CLOSE) return frac <= other ? 'end' : 'start'
    return 'center'
}

export type MarkerLayout = { frac: number; align: LabelAlign }
export type TimelineLayout = {
    playhead: MarkerLayout
    estimate: MarkerLayout
    marked: MarkerLayout | null
    /** 0…1 progress fill: from the window start to the playhead. */
    fill: number
}

export function timelineLayout(w: LoopWindow, estimateSec: number, playheadSec: number, markedSec: number | null): TimelineLayout {
    const est = positionInWindow(estimateSec, w)
    const mk = markedSec === null ? null : positionInWindow(markedSec, w)
    const ph = positionInWindow(playheadSec, w)
    return {
        playhead: { frac: ph, align: labelAlign(ph) },
        estimate: { frac: est, align: labelAlign(est, mk) }, // equal positions: estimate ends left of the pin, marked starts right of it
        marked: mk === null ? null : { frac: mk, align: mk === est && est >= EDGE && est <= 1 - EDGE ? 'start' : labelAlign(mk, est) },
        fill: ph,
    }
}

export type ReviewType = KeepType
export type DecisionState = { type: ReviewType | null; team: string | null }
export const EMPTY_DECISION: DecisionState = { type: null, team: null }

export type DecisionAction =
    | { kind: 'type'; type: ReviewType; defaultTeam?: string | null }
    | { kind: 'team'; team: string }
    | { kind: 'clear' }

export function needsTeam(type: ReviewType | null, teamCount: number): boolean {
    return (type === 'goal' || type === 'own_goal') && teamCount >= 2
}

/** Selecting a type never saves; goals pre-select `defaultTeam`. A team only counts once a goal / own goal is selected. */
export function decisionReducer(state: DecisionState, a: DecisionAction): DecisionState {
    switch (a.kind) {
        case 'type': {
            const wantsTeam = a.type === 'goal' || a.type === 'own_goal'
            const keepTeam = wantsTeam && (state.type === 'goal' || state.type === 'own_goal') ? state.team : null
            return { type: a.type, team: wantsTeam ? keepTeam ?? a.defaultTeam ?? null : null }
        }
        case 'team':
            return state.type === 'goal' || state.type === 'own_goal' ? { ...state, team: a.team } : state
        case 'clear':
            return EMPTY_DECISION
    }
}

export function canConfirm(state: DecisionState, teamCount: number): boolean {
    if (state.type === null) return false
    return !needsTeam(state.type, teamCount) || state.team !== null
}

const TYPE_NAME: Record<KeepType, string> = { goal: 'Goal', own_goal: 'Own goal', save: 'Save', highlight: 'Highlight' }

export type InstructionInput = {
    marked: boolean
    decision: DecisionState
    teamCount: number
    /** The time that will be saved, formatted (the marked time, or the estimate when unmarked). */
    clock: string
}
export type Instruction = { text: string; warning: string | null }

export const UNMARKED_WARNING = 'Using the estimate — mark the exact moment for accurate clips'

/** The line under the timeline: what to do next, by state. */
export function instructionText({ marked, decision, teamCount, clock }: InstructionInput): Instruction {
    const { type, team } = decision
    if (type === null) {
        return marked
            ? { text: `Marked at ${clock} — now choose what it was`, warning: null }
            : { text: 'Pause when the ball crosses the line or the moment happens, then press M (or tap Mark moment)', warning: null }
    }
    if (needsTeam(type, teamCount) && team === null) return { text: `${TYPE_NAME[type]} at ${clock} — choose the team (1 / 2)`, warning: marked ? null : UNMARKED_WARNING }
    const what = team ? `${TYPE_NAME[type]} · ${team}` : TYPE_NAME[type]
    return { text: `${what} at ${clock} — press Enter to confirm`, warning: marked ? null : UNMARKED_WARNING }
}

/** Label of the confirm button. */
export function confirmLabel(marked: boolean): string {
    return marked ? 'Confirm' : 'Confirm at estimate'
}
