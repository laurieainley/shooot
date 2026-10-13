import type { MarkerType, MatchEvent, Team } from '../types'
import { PICKER_OPTIONS, optionForKey, type PickerOption } from './eventTypes'
import { assistEdit, optionPatch, personEdit } from './eventEdit'
import { filterRoster, rosterTeamFor, sortNames, teamShortcuts } from './roster'

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

/** `touch`: a phone/tablet, where the optional note step is skipped (no keyboard); it is added from the tag toast instead. */
export type PickerContext = { teams: Team[]; touch: boolean }

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

/** Roster names matching the query at the person step, alphabetical. At the assist step the scorer stays in their slot (see `isDisabledName`), so the others never shift. */
export function scorerCandidates(state: PickerState, ctx: PickerContext): string[] {
    return sortNames(filterRoster(rosterTeam(state, ctx)?.roster ?? [], state.query))
}

/** The scorer is listed but not selectable as their own assist. */
export function isDisabledName(state: PickerState, name: string): boolean {
    return state.step === 'assist' && !!state.scorer && name.trim().toLowerCase() === state.scorer.trim().toLowerCase()
}

/** The next selectable candidate from `from` in `dir` (wrapping), or -1 when none can be picked. */
function nextEnabled(state: PickerState, candidates: string[], from: number, dir: 1 | -1): number {
    const n = candidates.length
    for (let step = 1; step <= n; step++) {
        const i = (((from + dir * step) % n) + n) % n
        if (!isDisabledName(state, candidates[i])) return i
    }
    return -1
}

/** The first selectable row (0 when there is none). */
export function firstEnabled(state: PickerState, ctx: PickerContext): number {
    const c = scorerCandidates(state, ctx)
    return Math.max(0, nextEnabled(state, c, -1, 1))
}

function wrap(i: number, n: number): number {
    return n === 0 ? 0 : (i + n) % n
}

const toText = (state: PickerState): PickerState => ({ ...state, step: 'text', highlighted: 0, query: '' })

/** The text step is skipped on touch when it is only optional. */
function wantsText(option: PickerOption, ctx: PickerContext): boolean {
    return !!option.askText && !(ctx.touch && option.askText === 'optional')
}

/** After the person step (picked or skipped): the text step when the type asks for one, else done. */
function afterPerson(state: PickerState, effects: PickerEffect[], ctx: PickerContext): Result {
    return wantsText(state.option, ctx) ? { state: toText(state), effects } : { state, effects: [...effects, CLOSE] }
}

function chooseOption(state: PickerState, option: PickerOption, ctx: PickerContext): Result {
    if (option.marker) return { state: { ...state, option }, effects: [{ kind: 'marker', type: option.type as MarkerType }, CLOSE] }
    const effects: PickerEffect[] = [{ kind: 'update', patch: optionPatch(option) }]
    const next = { ...state, option }
    if (option.askTeam && hasTeams(ctx)) {
        return { state: { ...next, step: 'team', highlighted: 0, query: '' }, effects }
    }
    return wantsText(option, ctx) ? { state: toText(next), effects } : { state: next, effects: [...effects, CLOSE] }
}

function chooseTeam(state: PickerState, team: string, ctx: PickerContext): Result {
    const effects: PickerEffect[] = [{ kind: 'update', patch: { team } }]
    const next = { ...state, team }
    if (state.option.askScorer) {
        return { state: { ...next, step: 'scorer', highlighted: 0, query: '' }, effects }
    }
    return afterPerson(next, effects, ctx)
}

function chooseScorer(state: PickerState, name: string, ctx: PickerContext): Result {
    const { patch, addToRoster } = personEdit(ctx.teams, { team: state.team, type: state.option.type }, name)
    const effects: PickerEffect[] = []
    if (addToRoster) effects.push({ kind: 'addToRoster', ...addToRoster })
    effects.push({ kind: 'update', patch })
    if (state.option.askAssist) {
        const next: PickerState = { ...state, step: 'assist', highlighted: 0, query: '', scorer: name.trim() }
        return { state: { ...next, highlighted: firstEnabled(next, ctx) }, effects }
    }
    return afterPerson(state, effects, ctx)
}

function chooseAssist(state: PickerState, name: string, ctx: PickerContext): Result {
    const { patch, addToRoster } = assistEdit(ctx.teams, { team: state.team, type: state.option.type, scorer: state.scorer }, name)
    if (patch.assist === undefined) return afterPerson(state, [], ctx)
    const effects: PickerEffect[] = []
    if (addToRoster) effects.push({ kind: 'addToRoster', ...addToRoster })
    effects.push({ kind: 'update', patch })
    return afterPerson(state, effects, ctx)
}

/** Skip an optional step; skipping the team skips the person too (no roster to pick from). */
function skip(state: PickerState, ctx: PickerContext): Result {
    if (state.step === 'team' && state.option.teamOptional) return afterPerson(state, [], ctx)
    if (state.step === 'scorer' && state.option.personOptional) return afterPerson(state, [], ctx)
    if (state.step === 'assist') return afterPerson(state, [], ctx)
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
        if (state.step === 'scorer' || state.step === 'assist') {
            const next = { ...state, query: input.value }
            return { state: { ...next, highlighted: firstEnabled(next, ctx) }, effects: [] }
        }
        return state.step === 'text' ? { state: { ...state, query: input.value, highlighted: 0 }, effects: [] } : none
    }

    if (input.kind === 'choose') {
        if (input.value === SKIP) return skip(state, ctx)
        if (state.step === 'type') {
            const option = PICKER_OPTIONS.find((o) => o.id === input.value)
            return option ? chooseOption(state, option, ctx) : none
        }
        if (state.step === 'team') return chooseTeam(state, input.value, ctx)
        if (state.step === 'text') return none
        return state.step === 'assist' ? chooseAssist(state, input.value, ctx) : chooseScorer(state, input.value, ctx)
    }

    const k = input.key
    if (state.step === 'text') return k === 'Enter' || k === 'Escape' ? finishText(state) : none
    if (k === 'Escape') return { state, effects: [CLOSE] }
    if (k === 'Tab') return skip(state, ctx)

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
        if (k === 'Enter') return chooseTeam(state, names[state.highlighted], ctx)
        const idx = k.length === 1 ? teamShortcuts(names).indexOf(k.toLowerCase()) : -1
        return idx >= 0 ? chooseTeam(state, names[idx], ctx) : none
    }

    // scorer / assist step — letters go to the text field
    const candidates = scorerCandidates(state, ctx)
    const move = (dir: 1 | -1): Result => {
        const i = nextEnabled(state, candidates, state.highlighted, dir)
        return i < 0 ? none : { state: { ...state, highlighted: i }, effects: [] }
    }
    if (k === 'ArrowDown') return move(1)
    if (k === 'ArrowUp') return move(-1)
    if (k === 'Enter') {
        const row = candidates[state.highlighted]
        const pick = state.query.trim() && candidates.length === 0 ? state.query.trim() : row !== undefined && !isDisabledName(state, row) ? row : undefined
        if (state.step === 'assist') return pick ? chooseAssist(state, pick, ctx) : skip(state, ctx)
        if (pick) return chooseScorer(state, pick, ctx)
        return state.option.personOptional ? skip(state, ctx) : { state, effects: [CLOSE] }
    }
    return none
}
