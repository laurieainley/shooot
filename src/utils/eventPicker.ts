import type { MarkerType, MatchEvent, Team } from '../types'
import { PICKER_OPTIONS, optionForKey, type PickerOption } from './eventTypes'
import { assistEdit, optionPatch, personEdit } from './eventEdit'
import { filterRoster, rosterTeamFor, teamShortcuts } from './roster'

export type PickerStep = 'type' | 'team' | 'scorer' | 'assist' | 'text'

/** `choose` value (and the Tab key) that skips an optional team / person step. */
export const SKIP = '__skip__'

export type PickerState = {
    step: PickerStep
    highlighted: number
    query: string
    option: PickerOption
    team?: string
    /** Chosen at the scorer step: not offered again as the assist. */
    scorer?: string
}

export type PickerInput =
    | { kind: 'key'; key: string }
    | { kind: 'choose'; value: string }
    | { kind: 'text'; value: string }

export type PickerEffect =
    | { kind: 'update'; patch: Partial<MatchEvent> }
    | { kind: 'remove' }
    | { kind: 'addToRoster'; team: string; name: string }
    /** Make the event this match marker (the store moves an existing one: single instance). */
    | { kind: 'marker'; type: MarkerType }
    | { kind: 'close' }

export type PickerContext = { teams: Team[] }

type Result = { state: PickerState; effects: PickerEffect[] }

export const initialPickerState: PickerState = { step: 'type', highlighted: 0, query: '', option: PICKER_OPTIONS[0] }

/** Touch start: nothing preselected (the first tap is the choice); Enter does nothing until an arrow moves in. */
export const touchPickerState: PickerState = { ...initialPickerState, highlighted: -1 }

const CLOSE: PickerEffect = { kind: 'close' }

function hasTeams(ctx: PickerContext): boolean {
    return ctx.teams.length >= 2 && ctx.teams.every((t) => t.name.trim() !== '')
}

function rosterTeam(state: PickerState, ctx: PickerContext): Team | undefined {
    return rosterTeamFor(ctx.teams, state.team, state.option.type)
}

/** Roster names matching the query at the person step; at the assist step the scorer is left out. */
export function scorerCandidates(state: PickerState, ctx: PickerContext): string[] {
    const names = filterRoster(rosterTeam(state, ctx)?.roster ?? [], state.query)
    const scorer = state.step === 'assist' ? state.scorer?.trim().toLowerCase() : undefined
    return scorer ? names.filter((n) => n.toLowerCase() !== scorer) : names
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
    if (option.marker) return { state: { ...state, option }, effects: [{ kind: 'marker', type: option.type as MarkerType }, CLOSE] }
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
    if (state.option.askAssist) return { state: { ...state, step: 'assist', highlighted: 0, query: '', scorer: name.trim() }, effects }
    return afterPerson(state, effects)
}

function chooseAssist(state: PickerState, name: string, ctx: PickerContext): Result {
    const { patch, addToRoster } = assistEdit(ctx.teams, { team: state.team, type: state.option.type, scorer: state.scorer }, name)
    if (patch.assist === undefined) return afterPerson(state, [])
    const effects: PickerEffect[] = []
    if (addToRoster) effects.push({ kind: 'addToRoster', ...addToRoster })
    effects.push({ kind: 'update', patch })
    return afterPerson(state, effects)
}

/** Skip an optional step; skipping the team skips the person too (no roster to pick from). */
function skip(state: PickerState): Result {
    if (state.step === 'team' && state.option.teamOptional) return afterPerson(state, [])
    if (state.step === 'scorer' && state.option.personOptional) return afterPerson(state, [])
    if (state.step === 'assist') return afterPerson(state, [])
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
        return state.step === 'scorer' || state.step === 'assist' || state.step === 'text' ? { state: { ...state, query: input.value, highlighted: 0 }, effects: [] } : none
    }

    if (input.kind === 'choose') {
        if (input.value === SKIP) return skip(state)
        if (state.step === 'type') {
            const option = PICKER_OPTIONS.find((o) => o.id === input.value)
            return option ? chooseOption(state, option, ctx) : none
        }
        if (state.step === 'team') return chooseTeam(state, input.value)
        if (state.step === 'text') return none
        return state.step === 'assist' ? chooseAssist(state, input.value, ctx) : chooseScorer(state, input.value, ctx)
    }

    const k = input.key
    if (state.step === 'text') return k === 'Enter' || k === 'Escape' ? finishText(state) : none
    if (k === 'Escape') return { state, effects: [CLOSE] }
    if (k === 'Tab') return skip(state)

    if (state.step === 'type') {
        const n = PICKER_OPTIONS.length
        if (k === 'Backspace') return { state, effects: [{ kind: 'remove' }, CLOSE] }
        if (k === 'ArrowDown') return { state: { ...state, highlighted: wrap(state.highlighted + 1, n) }, effects: [] }
        if (k === 'ArrowUp') return { state: { ...state, highlighted: state.highlighted < 0 ? n - 1 : wrap(state.highlighted - 1, n) }, effects: [] }
        if (k === 'Enter') return state.highlighted < 0 ? none : chooseOption(state, PICKER_OPTIONS[state.highlighted], ctx)
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

    // scorer / assist step — letters go to the text field
    const candidates = scorerCandidates(state, ctx)
    if (k === 'ArrowDown') return { state: { ...state, highlighted: wrap(state.highlighted + 1, candidates.length) }, effects: [] }
    if (k === 'ArrowUp') return { state: { ...state, highlighted: wrap(state.highlighted - 1, candidates.length) }, effects: [] }
    if (k === 'Enter') {
        const pick = state.query.trim() && candidates.length === 0 ? state.query.trim() : candidates[state.highlighted]
        if (state.step === 'assist') return pick ? chooseAssist(state, pick, ctx) : skip(state)
        if (pick) return chooseScorer(state, pick, ctx)
        return state.option.personOptional ? skip(state) : { state, effects: [CLOSE] }
    }
    return none
}
