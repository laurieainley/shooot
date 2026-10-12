import type { KeepType, Team } from '../types'
import { PICKER_OPTIONS } from './eventTypes'
import { initialPickerState, isDisabledName, pickerReducer, scorerCandidates, type PickerInput, type PickerState } from './eventPicker'

/** The optional scorer / assist steps on the review card: the event picker's own reducer, run for the person steps only. */
export type PeopleState = {
    /** Null when the type / team has no person steps. */
    pk: PickerState | null
    scorer?: string
    assist?: string
    /** Names new to a roster, added when the suggestion is confirmed (not while still choosing). */
    adds: { team: string; name: string }[]
}

export const NO_PEOPLE: PeopleState = { pk: null, adds: [] }

/** Goal (scorer + assist), own goal (the player) and save (goalkeeper) with two teams and the team chosen, as in the picker. Highlight asks nobody on the card. */
export function startPeople(type: KeepType | null, team: string | null, teamCount: number): PeopleState {
    if ((type !== 'goal' && type !== 'own_goal' && type !== 'save') || !team || teamCount < 2) return NO_PEOPLE
    const option = PICKER_OPTIONS.find((o) => o.id === type)
    if (!option) return NO_PEOPLE
    return { pk: { ...initialPickerState, step: 'scorer', option, team }, adds: [] }
}

/** A person step is waiting for an answer (the field shows). */
export function peopleOpen(p: PeopleState): boolean {
    return p.pk?.step === 'scorer' || p.pk?.step === 'assist'
}

export function peopleCandidates(p: PeopleState, teams: Team[]): string[] {
    return p.pk ? scorerCandidates(p.pk, { teams }) : []
}

/** The scorer in the assist list: shown, dimmed, not selectable. */
export function peopleDisabled(p: PeopleState, name: string): boolean {
    return !!p.pk && isDisabledName(p.pk, name)
}

export function peopleLabel(p: PeopleState): string {
    return p.pk?.step === 'assist' ? 'Assist' : p.pk?.option.personLabel ?? 'Scorer'
}

/** One input through the picker's reducer; skipping or finishing ends the steps. */
export function stepPeople(p: PeopleState, input: PickerInput, teams: Team[]): PeopleState {
    if (!p.pk) return p
    // On the card every person step is optional: Tab, or Enter on an empty field, ends them (the picker's Enter would pick the first name).
    if (input.kind === 'key' && (input.key === 'Tab' || (input.key === 'Enter' && !p.pk.query.trim()))) return { ...p, pk: { ...p.pk, step: 'text' } }
    const r = pickerReducer(p.pk, input, { teams })
    let next: PeopleState = { ...p, pk: r.state }
    for (const fx of r.effects) {
        if (fx.kind === 'update') {
            if ('scorer' in fx.patch) next = { ...next, scorer: fx.patch.scorer }
            if ('assist' in fx.patch) next = { ...next, assist: fx.patch.assist }
        } else if (fx.kind === 'addToRoster') next = { ...next, adds: [...next.adds, { team: fx.team, name: fx.name }] }
        else if (fx.kind === 'close') next = { ...next, pk: { ...r.state, step: 'text' } }
    }
    return next
}

/** Back to the scorer step (the user wants to change the names). */
export function reopenPeople(p: PeopleState): PeopleState {
    return p.pk ? { ...p, pk: { ...initialPickerState, step: 'scorer', option: p.pk.option, team: p.pk.team }, scorer: undefined, assist: undefined, adds: [] } : p
}
