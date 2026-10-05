import { describe, it, expect } from 'vitest'
import { pickerReducer, initialPickerState, scorerCandidates, SKIP, type PickerState, type PickerInput, type PickerContext } from './eventPicker'
import type { Team } from '../types'
import { PICKER_OPTIONS } from './eventTypes'

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
        expect(h.effects).toEqual([{ kind: 'update', patch: { type: 'highlight', pen: undefined } }])
        expect(h.state.step).toBe('team')
    })

    it('should mark penalty goals with pen', () => {
        expect(run([key('p')]).effects[0]).toEqual({ kind: 'update', patch: { type: 'goal', pen: true } })
    })

    it('should move the highlight with arrows and wrap', () => {
        expect(run([key('ArrowDown'), key('ArrowDown')]).state.highlighted).toBe(2)
        expect(run([key('ArrowUp')]).state.highlighted).toBe(PICKER_OPTIONS.length - 1)
        expect(run([key('ArrowDown'), key('Enter')]).effects[0]).toEqual({ kind: 'update', patch: { type: 'goal', pen: true } })
    })

    it('should close on Escape and delete on Backspace', () => {
        expect(run([key('Escape')]).effects).toEqual([{ kind: 'close' }])
        expect(run([key('Backspace')]).effects).toEqual([{ kind: 'remove' }, { kind: 'close' }])
    })

    it('should close after type when no teams are configured', () => {
        expect(run([key('Enter')], noTeams).effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should place a Kick off marker with K and finish (no team, person or text step)', () => {
        const r = run([key('k')])
        expect(r.effects).toEqual([{ kind: 'marker', type: 'kick_off' }, { kind: 'close' }])
    })

    it('should place a Final whistle marker with W and finish', () => {
        const r = run([key('W')])
        expect(r.effects).toEqual([{ kind: 'marker', type: 'final_whistle' }, { kind: 'close' }])
    })

    it('should place markers chosen by tap as well', () => {
        expect(run([{ kind: 'choose', value: 'final_whistle' }]).effects).toEqual([{ kind: 'marker', type: 'final_whistle' }, { kind: 'close' }])
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

const choose = (value: string): PickerInput => ({ kind: 'choose', value })
const text = (value: string): PickerInput => ({ kind: 'text', value })
const updates = (effects: ReturnType<typeof run>['effects']) =>
    effects.filter((e) => e.kind === 'update').map((e) => (e.kind === 'update' ? e.patch : {}))

describe('pickerReducer — per-type details', () => {
    it('should take a highlight through team → who → text and save the text on Enter', () => {
        const r = run([key('h'), key('w'), text('sa'), key('Enter'), text('nutmeg on the wing'), key('Enter')])
        expect(updates(r.effects)).toEqual([
            { type: 'highlight', pen: undefined }, { team: 'Whites' }, { scorer: 'Sam Taylor' }, { notes: 'nutmeg on the wing' },
        ])
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should move to the text step after the person step without closing', () => {
        const r = run([key('h'), key('w'), choose('Jo')])
        expect(r.state.step).toBe('text')
        expect(r.effects.at(-1)).toEqual({ kind: 'update', patch: { scorer: 'Jo' } })
    })

    it('should let a highlight skip the team (Tab or Skip) and go straight to the text', () => {
        for (const skip of [key('Tab'), choose(SKIP)]) {
            const r = run([key('h'), skip])
            expect(r.state.step).toBe('text')
            expect(r.effects).toEqual([{ kind: 'update', patch: { type: 'highlight', pen: undefined } }])
        }
    })

    it('should let a highlight skip the person and keep the team', () => {
        const r = run([key('h'), key('c'), key('Tab')])
        expect(r.state).toMatchObject({ step: 'text', team: 'Colours' })
    })

    it('should record a foul with a note', () => {
        const r = run([key('f'), key('c'), choose(SKIP), text('late tackle'), key('Enter')])
        expect(updates(r.effects)).toEqual([{ type: 'foul', pen: undefined }, { team: 'Colours' }, { notes: 'late tackle' }])
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should keep typed text on Escape (or Done) and write nothing when empty', () => {
        const kept = run([key('f'), key('Tab'), text('  handball '), key('Escape')])
        expect(kept.effects.slice(-2)).toEqual([{ kind: 'update', patch: { notes: 'handball' } }, { kind: 'close' }])
        const empty = run([key('f'), key('Tab'), key('Enter')])
        expect(empty.effects.slice(-1)).toEqual([{ kind: 'close' }])
        expect(updates(empty.effects)).toEqual([{ type: 'foul', pen: undefined }])
    })

    it('should treat letters on the text step as typing', () => {
        const r = run([key('h'), key('Tab'), key('w'), key('g')])
        expect(r.state.step).toBe('text')
        expect(r.effects).toHaveLength(1)
    })

    it('should go straight to the text step for a highlight when no teams are set', () => {
        const r = run([key('h')], noTeams)
        expect(r.state.step).toBe('text')
        expect(run([key('s')], noTeams).effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should let a save skip the goalkeeper and close', () => {
        const r = run([key('s'), key('w'), key('Tab')])
        expect(updates(r.effects)).toEqual([{ type: 'save', pen: undefined }, { team: 'Whites' }])
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should not skip a required step', () => {
        expect(run([key('Enter'), key('Tab')]).state.step).toBe('team')
        expect(run([key('Enter'), key('w'), choose(SKIP)]).state.step).toBe('scorer')
    })

    it('should pick the own-goal person from the other team', () => {
        const r = run([key('o'), key('c'), choose('Sam Taylor')])
        expect(updates(r.effects).at(-1)).toEqual({ scorer: 'Sam Taylor' })
        expect(r.effects).not.toContainEqual(expect.objectContaining({ kind: 'addToRoster' }))
    })
})
