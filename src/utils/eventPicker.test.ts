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
