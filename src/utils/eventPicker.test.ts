import { describe, it, expect } from 'vitest'
import { pickerReducer, initialPickerState, touchPickerState, scorerCandidates, isDisabledName, SKIP, type PickerState, type PickerInput, type PickerContext } from './eventPicker'
import type { Team } from '../types'
import { PICKER_OPTIONS } from './eventTypes'

const teams: Team[] = [
    { name: 'Whites', color: '#fff', roster: ['Sam Taylor', 'Sandy Wu'] },
    { name: 'Colours', color: '#f00', roster: ['Alex Wu', 'Jo'] },
]
const ctx: PickerContext = { teams, touch: false }
const noTeams: PickerContext = { teams: [], touch: false }
const touchCtx: PickerContext = { teams, touch: true }
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
        expect(run([key('Enter'), key('Enter')], noTeams).effects.at(-1)).toEqual({ kind: 'close' })
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
        const r = run([key('Enter'), key('2')])
        expect(r.effects.at(-1)).toEqual({ kind: 'update', patch: { team: 'Colours' } })
        expect(r.state).toMatchObject({ step: 'scorer', team: 'Colours' })
    })

    it('should choose the highlighted team on Enter', () => {
        const r = run([key('Enter'), key('ArrowDown'), key('Enter')])
        expect(r.state.team).toBe('Colours')
    })

    it('should go team, then Conceded by (conceding team roster), then the note for a conceded penalty', () => {
        const a = run([key('a')])
        expect(a.effects).toEqual([{ kind: 'update', patch: { type: 'penalty_conceded', pen: undefined } }])
        expect(a.state.step).toBe('team')
        const t = run([key('a'), key('2')])
        expect(t.state).toMatchObject({ step: 'scorer', team: 'Colours' })
        expect(scorerCandidates(t.state, ctx)).toEqual(['Alex Wu', 'Jo'])
        const p = run([key('a'), key('2'), { kind: 'text', value: 'jo' }, key('Enter')])
        expect(p.effects.at(-1)).toEqual({ kind: 'update', patch: { scorer: 'Jo' } })
        expect(p.state.step).toBe('text')
        expect(run([key('a'), key('2'), { kind: 'text', value: 'jo' }, key('Enter'), key('Enter')]).effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should let Conceded by be skipped and add a new name to the conceding roster', () => {
        expect(run([key('a'), key('2'), key('Tab')]).state.step).toBe('text')
        const r = run([key('a'), key('2'), { kind: 'text', value: 'Newbie' }, key('Enter')])
        expect(r.effects).toContainEqual({ kind: 'addToRoster', team: 'Colours', name: 'Newbie' })
    })

    it('should close on Escape', () => {
        expect(run([key('Enter'), key('Escape')]).effects.at(-1)).toEqual({ kind: 'close' })
    })
})

describe('pickerReducer — scorer step', () => {
    it('should filter by typed text and pick the highlighted match', () => {
        const r = run([key('Enter'), key('1'), { kind: 'text', value: 'sa' }, key('ArrowDown'), key('Enter'), key('Tab'), key('Enter')])
        expect(r.effects.slice(-2)).toEqual([{ kind: 'update', patch: { scorer: 'Sandy Wu' } }, { kind: 'close' }])
    })

    it('should add an unknown name to the roster', () => {
        const r = run([key('Enter'), key('1'), { kind: 'text', value: 'New Guy' }, key('Enter'), key('Tab'), key('Enter')])
        expect(r.effects.slice(-3)).toEqual([
            { kind: 'addToRoster', team: 'Whites', name: 'New Guy' },
            { kind: 'update', patch: { scorer: 'New Guy' } },
            { kind: 'close' },
        ])
    })

    it('should use the other team roster for own goals', () => {
        const r = run([key('o'), key('1')])
        expect(scorerCandidates(r.state, ctx)).toEqual(['Alex Wu', 'Jo'])
        const added = run([key('o'), key('1'), { kind: 'text', value: 'Zed' }, key('Enter')])
        expect(added.effects).toContainEqual({ kind: 'addToRoster', team: 'Colours', name: 'Zed' })
    })

    it('should ignore letter keys (they go to the text field) and close on Escape', () => {
        const r = run([key('Enter'), key('1'), key('h')])
        expect(r.state.step).toBe('scorer')
        expect(run([key('Enter'), key('1'), key('Escape')]).effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should close without a scorer on Enter with empty text and no roster', () => {
        const empty: PickerContext = { teams: [{ ...teams[0], roster: [] }, teams[1]], touch: false }
        const r = run([key('Enter'), key('1'), key('Enter')], empty)
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
            key('Enter'),
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
        const r = run([key('h'), key('1'), text('sa'), key('Enter'), text('nutmeg on the wing'), key('Enter')])
        expect(updates(r.effects)).toEqual([
            { type: 'highlight', pen: undefined }, { team: 'Whites' }, { scorer: 'Sam Taylor' }, { notes: 'nutmeg on the wing' },
        ])
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should move to the text step after the person step without closing', () => {
        const r = run([key('h'), key('1'), choose('Jo')])
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
        const r = run([key('h'), key('2'), key('Tab')])
        expect(r.state).toMatchObject({ step: 'text', team: 'Colours' })
    })

    it('should record a foul with a note', () => {
        const r = run([key('f'), key('2'), choose(SKIP), text('late tackle'), key('Enter')])
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
        const r = run([key('h'), key('Tab'), key('1'), key('g')])
        expect(r.state.step).toBe('text')
        expect(r.effects).toHaveLength(1)
    })

    it('should go straight to the text step for a highlight when no teams are set', () => {
        const r = run([key('h')], noTeams)
        expect(r.state.step).toBe('text')
        expect(run([key('s'), key('Enter')], noTeams).effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should let a save skip the goalkeeper and close', () => {
        const r = run([key('s'), key('1'), key('Tab'), key('Enter')])
        expect(updates(r.effects)).toEqual([{ type: 'save', pen: undefined }, { team: 'Whites' }])
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should not skip a required step', () => {
        expect(run([key('Enter'), key('Tab')]).state.step).toBe('team')
        expect(run([key('Enter'), key('1'), choose(SKIP)]).state.step).toBe('scorer')
    })

    it('should pick the own-goal person from the other team', () => {
        const r = run([key('o'), key('2'), choose('Sam Taylor')])
        expect(updates(r.effects).at(-1)).toEqual({ scorer: 'Sam Taylor' })
        expect(r.effects).not.toContainEqual(expect.objectContaining({ kind: 'addToRoster' }))
    })
})

describe('pickerReducer — touch start (nothing preselected)', () => {
    it('should start with no highlighted option', () => {
        expect(touchPickerState.highlighted).toBe(-1)
        expect(touchPickerState.step).toBe('type')
    })

    it('should do nothing on Enter while nothing is highlighted', () => {
        const r = pickerReducer(touchPickerState, key('Enter'), ctx)
        expect(r.effects).toEqual([])
        expect(r.state).toBe(touchPickerState)
    })

    it('should enter the list from the top with ArrowDown and from the bottom with ArrowUp', () => {
        expect(pickerReducer(touchPickerState, key('ArrowDown'), ctx).state.highlighted).toBe(0)
        expect(pickerReducer(touchPickerState, key('ArrowUp'), ctx).state.highlighted).toBe(PICKER_OPTIONS.length - 1)
    })

    it('should emit no effect until a type is chosen, then update the event', () => {
        const none = pickerReducer(touchPickerState, key('Escape'), ctx)
        expect(none.effects).toEqual([{ kind: 'close' }])
        const chosen = pickerReducer(touchPickerState, { kind: 'choose', value: 'goal' }, ctx)
        expect(chosen.effects[0]).toMatchObject({ kind: 'update' })
        expect(chosen.state.step).toBe('team')
    })
})

describe('pickerReducer — assist step', () => {
    const toScorer = [key('g'), key('1')] // G, team Whites (shortcut w)
    const afterScorer = [...toScorer, { kind: 'choose', value: 'Sam Taylor' } as PickerInput]

    it('should offer an assist step after the scorer of a normal goal', () => {
        const r = run(afterScorer)
        expect(r.state.step).toBe('assist')
        expect(r.effects).toEqual([{ kind: 'update', patch: { type: 'goal', pen: undefined } }, { kind: 'update', patch: { team: 'Whites' } }, { kind: 'update', patch: { scorer: 'Sam Taylor' } }])
        expect(r.effects).not.toContainEqual({ kind: 'close' })
    })

    it('should list the scorer\'s team roster alphabetically, the scorer kept in place but disabled', () => {
        const r = run(afterScorer)
        expect(scorerCandidates(r.state, ctx)).toEqual(['Sam Taylor', 'Sandy Wu'])
        expect(isDisabledName(r.state, 'Sam Taylor')).toBe(true)
        expect(isDisabledName(r.state, 'Sandy Wu')).toBe(false)
        expect(r.state.highlighted).toBe(1) // the first selectable row
        const typed = run([...afterScorer, { kind: 'text', value: 'sa' }])
        expect(scorerCandidates(typed.state, ctx)).toEqual(['Sam Taylor', 'Sandy Wu'])
        expect(typed.state.highlighted).toBe(1)
    })

    it('should save a chosen assist and close', () => {
        const r = run([...afterScorer, { kind: 'choose', value: 'Sandy Wu' }, key('Enter')])
        expect(r.effects.slice(-2)).toEqual([{ kind: 'update', patch: { assist: 'Sandy Wu' } }, { kind: 'close' }])
    })

    it('should choose the highlighted assist on Enter', () => {
        const r = run([...afterScorer, key('Enter'), key('Enter')])
        expect(r.effects.slice(-2)).toEqual([{ kind: 'update', patch: { assist: 'Sandy Wu' } }, { kind: 'close' }])
    })

    it('should leave no assist on Skip, Tab, Escape or an empty Enter', () => {
        for (const input of [{ kind: 'choose', value: SKIP } as PickerInput, key('Tab'), key('Escape')]) {
            const r = run([...afterScorer, input, ...(input.kind === 'key' && input.key === 'Escape' ? [] : [key('Enter')])])
            expect(r.effects.some((e) => e.kind === 'update' && 'assist' in e.patch)).toBe(false)
            expect(r.effects.at(-1)).toEqual({ kind: 'close' })
        }
        const noOne = run([...afterScorer, { kind: 'text', value: 'zzz' }, key('Backspace')])
        expect(noOne.state.step).toBe('assist')
        const enter = run([key('g'), key('2'), { kind: 'choose', value: 'Jo' }, { kind: 'text', value: '' }, key('ArrowDown'), key('Enter'), key('Enter')])
        expect(enter.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should add a new typed name to the scoring team roster', () => {
        const r = run([...afterScorer, { kind: 'text', value: 'Newbie' }, key('Enter'), key('Enter')])
        expect(r.effects.slice(-3)).toEqual([
            { kind: 'addToRoster', team: 'Whites', name: 'Newbie' },
            { kind: 'update', patch: { assist: 'Newbie' } },
            { kind: 'close' },
        ])
    })

    it('should not take the scorer as their own assist', () => {
        const r = run([...afterScorer, { kind: 'text', value: 'sam taylor' }, key('Enter'), key('Enter')])
        expect(r.effects.some((e) => e.kind === 'update' && 'assist' in e.patch)).toBe(false)
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should not offer an assist for penalty goals or own goals', () => {
        expect(run([key('p'), key('1'), { kind: 'choose', value: 'Sam Taylor' }, key('Enter')]).effects.at(-1)).toEqual({ kind: 'close' })
        expect(run([key('o'), key('1'), { kind: 'choose', value: 'Jo' }, key('Enter')]).effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should still close after the assist when the goal has no team step (no teams)', () => {
        expect(run([key('g'), key('Enter')], noTeams).effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should accept typed text in the assist step', () => {
        expect(run([...afterScorer, { kind: 'text', value: 'x' }]).state.query).toBe('x')
    })
})

describe('pickerReducer — optional note on every event', () => {
    it('should ask for an optional note after the goalkeeper on a save and store it', () => {
        const r = run([key('s'), key('1'), key('Tab'), text('great stop'), key('Enter')])
        expect(r.state.step).toBe('text')
        expect(updates(r.effects)).toEqual([{ type: 'save', pen: undefined }, { team: 'Whites' }, { notes: 'great stop' }])
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should keep a goal note after the assist step', () => {
        const r = run([key('g'), key('1'), choose('Sam Taylor'), key('Tab'), text('top corner'), key('Enter')])
        expect(updates(r.effects)).toContainEqual({ notes: 'top corner' })
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should let Skip-style keys (Tab, Escape, empty Enter) leave no note', () => {
        for (const k of ['Enter', 'Escape']) {
            const r = run([key('s'), key('1'), key('Tab'), key(k)])
            expect(updates(r.effects).some((u) => 'notes' in u)).toBe(false)
            expect(r.effects.at(-1)).toEqual({ kind: 'close' })
        }
    })

    it('should not ask for a note on match markers', () => {
        expect(run([key('k')]).state.step).not.toBe('text')
    })
})

describe('pickerReducer — touch skips the optional note', () => {
    it('should close after the assist on touch instead of asking for a note', () => {
        const r = run([key('Enter'), key('1'), { kind: 'choose', value: 'Sam Taylor' }, { kind: 'choose', value: 'Sandy Wu' }], touchCtx)
        expect(r.state.step).toBe('assist')
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should close instead of the note step when skipping the assist on touch', () => {
        const r = run([key('Enter'), key('1'), { kind: 'choose', value: 'Sam Taylor' }, { kind: 'choose', value: SKIP }], touchCtx)
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should close after skipping the person of a foul on touch', () => {
        const r = run([key('f'), { kind: 'choose', value: 'Whites' }, { kind: 'choose', value: SKIP }], touchCtx)
        expect(r.effects.at(-1)).toEqual({ kind: 'close' })
    })

    it('should keep the text step for a prompt type (Highlight) on touch', () => {
        const r = run([key('h'), { kind: 'choose', value: SKIP }], touchCtx)
        expect(r.state.step).toBe('text')
        expect(r.effects.some((e) => e.kind === 'close')).toBe(false)
    })

    it('should still go to the note step on desktop', () => {
        const r = run([key('f'), { kind: 'choose', value: 'Whites' }, { kind: 'choose', value: SKIP }])
        expect(r.state.step).toBe('text')
    })
})

describe('pickerReducer — goto (breadcrumbs on touch)', () => {
    const choose = (value: string): PickerInput => ({ kind: 'choose', value })
    it('should go back to the type step and ask for the team again', () => {
        const r = run([choose('goal'), choose('Whites'), { kind: 'goto', step: 'type' }, choose('save')], touchCtx)
        expect(r.state.step).toBe('team')
        expect(r.state.team).toBeUndefined()
        expect(r.state.option.id).toBe('save')
    })
    it('should go back to the team step keeping the type', () => {
        const r = run([choose('goal'), choose('Whites'), { kind: 'goto', step: 'team' }], touchCtx)
        expect(r.state.step).toBe('team')
        expect(r.state.option.id).toBe('goal')
        expect(r.effects.filter((e) => e.kind === 'close')).toEqual([])
    })
    it('should go back to the scorer from the assist step and ask for the assist again after', () => {
        const r = run([choose('goal'), choose('Whites'), choose('Sam Taylor'), { kind: 'goto', step: 'scorer' }], touchCtx)
        expect(r.state.step).toBe('scorer')
        expect(r.state.scorer).toBeUndefined()
        const again = pickerReducer(r.state, choose('Sandy Wu'), touchCtx)
        expect(again.state.step).toBe('assist')
        expect(isDisabledName(again.state, 'Sandy Wu')).toBe(true)
    })
    it('should ignore a jump to a question this type does not ask', () => {
        const r = run([choose('kick_off'), { kind: 'goto', step: 'scorer' }], touchCtx)
        expect(r.state.step).toBe('type')
        const noTeam = pickerReducer(initialPickerState, { kind: 'goto', step: 'scorer' }, touchCtx)
        expect(noTeam.state).toBe(initialPickerState)
    })
})

describe('pickerReducer — back', () => {
    const choose = (value: string): PickerInput => ({ kind: 'choose', value })
    const back: PickerInput = { kind: 'back' }

    it('should do nothing on the type step', () => {
        const r = pickerReducer(initialPickerState, back, ctx)
        expect(r.state).toBe(initialPickerState)
        expect(r.effects).toEqual([])
    })
    it('should go team -> type, forgetting the team, without effects', () => {
        const r = run([choose('goal'), back])
        expect(r.state).toMatchObject({ step: 'type', team: undefined, highlighted: 0 })
        expect(r.effects.filter((e) => e.kind === 'close' || e.kind === 'remove')).toEqual([])
    })
    it('should go scorer -> team and let a different team be picked', () => {
        const r = run([choose('goal'), choose('Whites'), back])
        expect(r.state).toMatchObject({ step: 'team', highlighted: 0 })
        const again = pickerReducer(r.state, key('2'), ctx)
        expect(again.effects).toEqual([{ kind: 'update', patch: { team: 'Colours' } }])
        expect(again.state).toMatchObject({ step: 'scorer', team: 'Colours' })
    })
    it('should go assist -> scorer, clearing the scorer so the assist rule follows the new pick', () => {
        const r = run([choose('goal'), choose('Whites'), choose('Sam Taylor'), back])
        expect(r.state).toMatchObject({ step: 'scorer', scorer: undefined, query: '' })
        const again = pickerReducer(r.state, choose('Sandy Wu'), ctx)
        expect(isDisabledName(again.state, 'Sandy Wu')).toBe(true)
        expect(isDisabledName(again.state, 'Sam Taylor')).toBe(false)
    })
    it('should go text -> assist for a goal, -> scorer when there is no assist, -> team without a scorer', () => {
        const goal = run([choose('goal'), choose('Whites'), choose('Sam Taylor'), key('Tab')])
        expect(goal.state.step).toBe('text')
        expect(pickerReducer(goal.state, back, ctx).state.step).toBe('assist')
        const fouled = run([choose('foul'), choose('Whites'), choose('Jo'), key('Enter')])
        expect(fouled.state.step).toBe('text')
        expect(pickerReducer(fouled.state, back, ctx).state.step).toBe('scorer')
        const hl = run([choose('highlight'), choose('Whites'), key('Tab')])
        expect(hl.state.step).toBe('text')
    })
    it('should go text -> type for a type that asks no team', () => {
        const r = run([choose('goal')], noTeams)
        expect(r.state.step).toBe('text')
        expect(pickerReducer(r.state, back, noTeams).state.step).toBe('type')
    })
    it('should use nothing preselected on touch', () => {
        const r = run([choose('goal'), back], touchCtx)
        expect(r.state.highlighted).toBe(-1)
    })
    it('should go back on Backspace when the field is empty, edit text otherwise', () => {
        expect(run([choose('goal'), key('Backspace')]).state.step).toBe('type')
        expect(run([choose('goal'), choose('Whites'), key('Backspace')]).state.step).toBe('team')
        expect(run([choose('goal'), choose('Whites'), choose('Sam Taylor'), key('Backspace')]).state.step).toBe('scorer')
        const typed = run([choose('goal'), choose('Whites'), { kind: 'text', value: 'sa' }, key('Backspace')])
        expect(typed.state).toMatchObject({ step: 'scorer', query: 'sa' })
        const note = run([choose('goal'), choose('Whites'), choose('Sam Taylor'), key('Tab'), key('Backspace')])
        expect(note.state.step).toBe('assist')
        const noteTyped = run([choose('goal'), choose('Whites'), choose('Sam Taylor'), key('Tab'), { kind: 'text', value: 'x' }, key('Backspace')])
        expect(noteTyped.state.step).toBe('text')
    })
    it('should keep Backspace on the type step as cancel', () => {
        expect(run([key('Backspace')]).effects).toEqual([{ kind: 'remove' }, { kind: 'close' }])
    })
})

describe('pickerReducer — number keys', () => {
    const choose = (value: string): PickerInput => ({ kind: 'choose', value })
    it('should choose the first and second team on 1 and 2, and ignore letters and 3', () => {
        expect(run([key('Enter'), key('2')]).state.team).toBe('Colours')
        expect(run([key('Enter'), key('1')]).state.team).toBe('Whites')
        expect(run([key('Enter'), key('3')]).state.step).toBe('team')
        expect(run([key('Enter'), key('w')]).state.step).toBe('team')
    })
    it('should pick the Nth displayed scorer', () => {
        const r = run([choose('goal'), choose('Whites'), key('2')])
        expect(r.effects).toContainEqual({ kind: 'update', patch: { scorer: 'Sandy Wu' } })
        expect(r.state.step).toBe('assist')
    })
    it('should count rows after the typed filter', () => {
        const r = run([choose('goal'), choose('Colours'), { kind: 'text', value: 'jo' }, key('1')])
        expect(r.effects).toContainEqual({ kind: 'update', patch: { scorer: 'Jo' } })
    })
    it('should ignore a number with no row', () => {
        const r = run([choose('goal'), choose('Whites'), key('5')])
        expect(r.state.step).toBe('scorer')
    })
    it('should pick the Nth assist, and ignore the disabled scorer row', () => {
        const base = [choose('goal'), choose('Whites'), choose('Sam Taylor')]
        expect(run([...base, key('1')]).state.step).toBe('assist') // Sam Taylor is row 1, disabled
        const r = run([...base, key('2')])
        expect(r.effects.at(-1)).toEqual({ kind: 'update', patch: { assist: 'Sandy Wu' } })
    })
})
