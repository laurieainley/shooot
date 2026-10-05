import type { MatchEvent, Team } from '../types'
import { PICKER_OPTIONS, optionForKey, type PickerOption } from './eventTypes'
import { optionPatch, personEdit } from './eventEdit'
import { filterRoster, rosterTeamFor, teamShortcuts } from './roster'

export type PickerStep = 'type' | 'team' | 'scorer' | 'text'

/** `choose` value (and the Tab key) that skips an optional team / person step. */
export const SKIP = '__skip__'

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
    return rosterTeamFor(ctx.teams, state.team, state.option.type)
}

export function scorerCandidates(state: PickerState, ctx: PickerContext): string[] {
    return filterRoster(rosterTeam(state, ctx)?.roster ?? [], state.query)
}

function wrap(i: number, n: number): number {
    return n === 0 ? 0 : (i + n) % n
}

const toText = (state: PickerState): PickerState => ({ ...state, step: 'text', highlighted: 0, query: '' })

/** After the person step (picked or skipped): the text step when the type asks for one, else done. */
function afterPerson(state: PickerState, effects: PickerEffect[]): Result {
    return state.option.askText ? { state: toText(state), effects } : { state, effects: [...effects, CLOSE] }
}

function chooseOption(state: PickerState, option: PickerOption, ctx: PickerContext): Result {
    const effects: PickerEffect[] = [{ kind: 'update', patch: optionPatch(option) }]
    const next = { ...state, option }
    if (option.askTeam && hasTeams(ctx)) {
        return { state: { ...next, step: 'team', highlighted: 0, query: '' }, effects }
    }
    return option.askText ? { state: toText(next), effects } : { state: next, effects: [...effects, CLOSE] }
}

function chooseTeam(state: PickerState, team: string): Result {
    const effects: PickerEffect[] = [{ kind: 'update', patch: { team } }]
    const next = { ...state, team }
    if (state.option.askScorer) {
        return { state: { ...next, step: 'scorer', highlighted: 0, query: '' }, effects }
    }
    return afterPerson(next, effects)
}

function chooseScorer(state: PickerState, name: string, ctx: PickerContext): Result {
    const { patch, addToRoster } = personEdit(ctx.teams, { team: state.team, type: state.option.type }, name)
    const effects: PickerEffect[] = []
    if (addToRoster) effects.push({ kind: 'addToRoster', ...addToRoster })
    effects.push({ kind: 'update', patch })
    return afterPerson(state, effects)
}

/** Skip an optional step; skipping the team skips the person too (no roster to pick from). */
function skip(state: PickerState): Result {
    if (state.step === 'team' && state.option.teamOptional) return afterPerson(state, [])
    if (state.step === 'scorer' && state.option.personOptional) return afterPerson(state, [])
    return { state, effects: [] }
}

/** Leave the text step, keeping whatever was typed. */
function finishText(state: PickerState): Result {
    const notes = state.query.trim()
    return { state, effects: notes ? [{ kind: 'update', patch: { notes } }, CLOSE] : [CLOSE] }
}

export function pickerReducer(state: PickerState, input: PickerInput, ctx: PickerContext): Result {
    const none: Result = { state, effects: [] }

    if (input.kind === 'text') {
        return state.step === 'scorer' || state.step === 'text' ? { state: { ...state, query: input.value, highlighted: 0 }, effects: [] } : none
    }

    if (input.kind === 'choose') {
        if (input.value === SKIP) return skip(state)
        if (state.step === 'type') {
            const option = PICKER_OPTIONS.find((o) => o.id === input.value)
            return option ? chooseOption(state, option, ctx) : none
        }
        if (state.step === 'team') return chooseTeam(state, input.value)
        if (state.step === 'text') return none
        return chooseScorer(state, input.value, ctx)
    }

    const k = input.key
    if (state.step === 'text') return k === 'Enter' || k === 'Escape' ? finishText(state) : none
    if (k === 'Escape') return { state, effects: [CLOSE] }
    if (k === 'Tab') return skip(state)

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
        if (pick) return chooseScorer(state, pick, ctx)
        return state.option.personOptional ? skip(state) : { state, effects: [CLOSE] }
    }
    return none
}
