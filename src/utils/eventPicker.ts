import type { MatchEvent, Team } from '../types'
import { PICKER_OPTIONS, optionForKey, type PickerOption } from './eventTypes'
import { filterRoster, rosterTeamFor, teamShortcuts } from './roster'

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
    return rosterTeamFor(ctx.teams, state.team, state.option.type)
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
