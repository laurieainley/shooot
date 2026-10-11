import { describe, expect, it } from 'vitest'
import {
    EMPTY_DECISION, canConfirm, confirmLabel, decisionReducer, instructionText, labelAlign, positionInWindow, timeAtPosition,
    timelineLayout, windowTicks,
} from './reviewMark'

const w = { startAbs: 95, endAbs: 102 }

describe('positionInWindow / timeAtPosition', () => {
    it('should map the window to 0…1 and clamp outside it', () => {
        expect(positionInWindow(95, w)).toBe(0)
        expect(positionInWindow(98.5, w)).toBeCloseTo(0.5)
        expect(positionInWindow(120, w)).toBe(1)
        expect(positionInWindow(10, w)).toBe(0)
    })
    it('should survive an empty window', () => { expect(positionInWindow(5, { startAbs: 5, endAbs: 5 })).toBe(0) })
    it('should invert the mapping', () => { expect(timeAtPosition(0.5, w)).toBeCloseTo(98.5); expect(timeAtPosition(2, w)).toBe(102) })
})

describe('windowTicks', () => {
    it('should tick every second, majors on multiples of five', () => {
        const t = windowTicks(w)
        expect(t).toHaveLength(8)
        expect(t.filter((x) => x.major).map((x) => x.frac)).toEqual([positionInWindow(95, w), positionInWindow(100, w)])
    })
    it('should thin the ticks for long windows', () => {
        expect(windowTicks({ startAbs: 0, endAbs: 100 }).length).toBeLessThanOrEqual(11)
    })
})

describe('labelAlign', () => {
    it('should keep edge labels inside the bar', () => {
        expect(labelAlign(0.02)).toBe('start'); expect(labelAlign(0.97)).toBe('end'); expect(labelAlign(0.5)).toBe('center')
    })
    it('should push two close labels apart', () => {
        expect(labelAlign(0.5, 0.55)).toBe('end'); expect(labelAlign(0.55, 0.5)).toBe('start'); expect(labelAlign(0.5, 0.9)).toBe('center')
    })
})

describe('timelineLayout', () => {
    it('should place the playhead, estimate, mark and fill', () => {
        const l = timelineLayout(w, 96.5, 98.5, 99.4)
        expect(l.fill).toBeCloseTo(0.5); expect(l.playhead.frac).toBeCloseTo(0.5)
        expect(l.estimate.frac).toBeCloseTo(1.5 / 7); expect(l.marked?.frac).toBeCloseTo(4.4 / 7)
    })
    it('should have no marked pin until marked', () => { expect(timelineLayout(w, 96, 96, null).marked).toBeNull() })
})

describe('decisionReducer', () => {
    it('should select a type without confirming and pre-select the default team for goals', () => {
        expect(decisionReducer(EMPTY_DECISION, { kind: 'type', type: 'highlight' })).toEqual({ type: 'highlight', team: null })
        expect(decisionReducer(EMPTY_DECISION, { kind: 'type', type: 'goal', defaultTeam: 'Whites' })).toEqual({ type: 'goal', team: 'Whites' })
    })
    it('should keep the chosen team when switching between goal and own goal, and drop it for other types', () => {
        const s = decisionReducer({ type: 'goal', team: 'Whites' }, { kind: 'team', team: 'Colours' })
        expect(decisionReducer(s, { kind: 'type', type: 'own_goal', defaultTeam: 'Whites' }).team).toBe('Colours')
        expect(decisionReducer(s, { kind: 'type', type: 'save' }).team).toBeNull()
    })
    it('should ignore a team when no goal is selected, and clear', () => {
        expect(decisionReducer(EMPTY_DECISION, { kind: 'team', team: 'Whites' })).toEqual(EMPTY_DECISION)
        expect(decisionReducer({ type: 'goal', team: 'Whites' }, { kind: 'clear' })).toEqual(EMPTY_DECISION)
    })
})

describe('canConfirm', () => {
    it('should need a type, and a team for goals when there are two teams', () => {
        expect(canConfirm(EMPTY_DECISION, 2)).toBe(false)
        expect(canConfirm({ type: 'goal', team: null }, 2)).toBe(false)
        expect(canConfirm({ type: 'goal', team: null }, 0)).toBe(true)
        expect(canConfirm({ type: 'reject', team: null }, 2)).toBe(true)
        expect(canConfirm({ type: 'save', team: null }, 2)).toBe(true)
    })
})

describe('instructionText', () => {
    const base = { teamCount: 2, clock: '23:41.6' }
    it('should tell the user to pause and mark before marking', () => {
        expect(instructionText({ ...base, marked: false, decision: EMPTY_DECISION }).text).toBe('Pause when the ball crosses the line, then press M (or tap Mark moment)')
    })
    it('should confirm the mark and ask what it was', () => {
        expect(instructionText({ ...base, marked: true, decision: EMPTY_DECISION }).text).toBe('Marked at 23:41.6 — now choose what it was')
    })
    it('should say what will be saved, and warn when unmarked', () => {
        const i = instructionText({ ...base, marked: true, decision: { type: 'goal', team: 'Whites' } })
        expect(i).toEqual({ text: 'Goal · Whites at 23:41.6 — press Enter to save', warning: null })
        expect(instructionText({ ...base, marked: false, decision: { type: 'save', team: null } }).warning).toBe('Using the estimate — mark the exact moment for accurate clips')
    })
    it('should ask for the team when a goal has none, and say reject plainly', () => {
        expect(instructionText({ ...base, marked: true, decision: { type: 'goal', team: null } }).text).toContain('choose the team')
        expect(instructionText({ ...base, marked: false, decision: { type: 'reject', team: null } })).toEqual({ text: 'Not a goal — press Enter to reject', warning: null })
    })
})

describe('confirmLabel', () => {
    it('should read Save, Save at estimate or Reject', () => {
        expect(confirmLabel('goal', true)).toBe('Save'); expect(confirmLabel('goal', false)).toBe('Save at estimate')
        expect(confirmLabel('reject', false)).toBe('Reject'); expect(confirmLabel(null, false)).toBe('Save at estimate')
    })
})

describe('timelineLayout labels', () => {
    it('should put the estimate and marked labels on opposite sides when they coincide', () => {
        const l = timelineLayout(w, 98.5, 98.5, 98.5)
        expect(l.estimate.align).toBe('end'); expect(l.marked?.align).toBe('start')
    })
})
