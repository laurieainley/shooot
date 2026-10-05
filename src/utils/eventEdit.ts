import type { MatchEvent, Team } from '../types'
import { PICKER_OPTIONS, type PickerOption } from './eventTypes'
import { rosterTeamFor } from './roster'

/** The picker option an existing event corresponds to (a penalty goal is "Goal (pen)"). */
export function optionForEvent(e: Pick<MatchEvent, 'type' | 'pen'>): PickerOption {
    const id = e.type === 'goal' ? (e.pen ? 'goal_pen' : 'goal') : e.type
    return PICKER_OPTIONS.find((o) => o.id === id) ?? PICKER_OPTIONS[0]
}

/** Type and pen flag for a picker option — the same patch the picker writes when a type is chosen. */
export function optionPatch(option: PickerOption): Partial<MatchEvent> {
    return { type: option.type, pen: option.pen ? true : undefined }
}

/** Changing an existing event's type; a type without a person step (penalty awarded) drops the person. */
export function typeChangePatch(e: Pick<MatchEvent, 'scorer'>, option: PickerOption): Partial<MatchEvent> {
    const patch = optionPatch(option)
    return !option.askScorer && e.scorer !== undefined ? { ...patch, scorer: undefined } : patch
}

export type PersonEdit = { patch: Partial<MatchEvent>; addToRoster?: { team: string; name: string } }

/**
 * Setting the person on an event: trimmed (blank clears it); a name new to the roster it is picked from
 * (the credited team, or the other team for an own goal) is added to that roster.
 */
export function personEdit(teams: Team[], e: Pick<MatchEvent, 'team' | 'type'>, name: string): PersonEdit {
    const clean = name.trim()
    if (!clean) return { patch: { scorer: undefined } }
    const roster = rosterTeamFor(teams, e.team, e.type)
    const known = roster?.roster.some((r) => r.toLowerCase() === clean.toLowerCase()) ?? false
    return roster && !known ? { patch: { scorer: clean }, addToRoster: { team: roster.name, name: clean } } : { patch: { scorer: clean } }
}
