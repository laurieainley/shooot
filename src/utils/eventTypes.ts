import { migrateReplayCrop } from './crop'
import type { EventType, MarkerType, MatchEvent } from '../types'

export type EventMeta = {
    label: string
    icon: string
    color: string
    scoring: boolean
    /** Kick off / Half time / Final whistle: one each, no details, never in the highlights. */
    marker?: boolean
}

export const EVENT_META: Record<EventType, EventMeta> = {
    goal:            { label: 'Goal',            icon: '⚽', color: '#f72585', scoring: true },
    own_goal:        { label: 'Own goal',        icon: '⚽', color: '#e63946', scoring: true },
    penalty_awarded: { label: 'Penalty awarded', icon: 'Ⓟ', color: '#fee440', scoring: false },
    penalty_missed:  { label: 'Penalty missed',  icon: 'Ⓟ', color: '#a0a0a0', scoring: false },
    highlight:       { label: 'Highlight',       icon: '★', color: '#4cc9f0', scoring: false },
    foul:            { label: 'Foul',            icon: '🟨', color: '#f4a261', scoring: false },
    save:            { label: 'Save',            icon: '🧤', color: '#4cc9f0', scoring: false },
    kick_off:        { label: 'Kick off',        icon: '⚑', color: '#22c55e', scoring: false, marker: true },
    half_time:       { label: 'Half time',       icon: '⏸', color: '#f59e0b', scoring: false, marker: true },
    final_whistle:   { label: 'Final whistle',   icon: '🏁', color: '#e5e5e5', scoring: false, marker: true },
}

export type PickerOptionId = 'goal' | 'goal_pen' | 'own_goal' | 'penalty_awarded' | 'penalty_missed' | 'highlight' | 'foul' | 'save' | MarkerType

export type PickerOption = {
    id: PickerOptionId
    type: EventType
    pen: boolean
    key: string          // lower-case shortcut in the picker
    label: string
    askTeam: boolean
    teamOptional: boolean       // team step shows Skip
    askScorer: boolean          // person step (stored in `scorer`)
    personLabel?: string
    personOptional: boolean     // person step shows Skip
    askText: 'prompt' | 'optional' | false // free-text step (stored in `notes`)
    textLabel?: string
    marker?: boolean            // single-instance match marker (no further steps)
}

type Base = Pick<PickerOption, 'pen' | 'askTeam' | 'teamOptional' | 'askScorer' | 'personOptional' | 'askText'>
const SCORER: Base = { pen: false, askTeam: true, teamOptional: false, askScorer: true, personOptional: false, askText: false }
const MARKER: Base = { pen: false, askTeam: false, teamOptional: false, askScorer: false, personOptional: false, askText: false }
const OPTIONAL_ALL: Base = { pen: false, askTeam: true, teamOptional: true, askScorer: true, personOptional: true, askText: 'optional' }

export const PICKER_OPTIONS: PickerOption[] = [
    { ...SCORER, id: 'goal',            type: 'goal',            key: 'g', label: 'Goal',            personLabel: 'Scorer' },
    { ...SCORER, id: 'goal_pen',        type: 'goal',            key: 'p', label: 'Penalty goal',     personLabel: 'Penalty taker', pen: true },
    { ...SCORER, id: 'own_goal',        type: 'own_goal',        key: 'o', label: 'Own goal',        personLabel: 'Own goal by' },
    { ...SCORER, id: 'penalty_awarded', type: 'penalty_awarded', key: 'a', label: 'Penalty awarded', askScorer: false },
    { ...SCORER, id: 'penalty_missed',  type: 'penalty_missed',  key: 'x', label: 'Penalty missed',  personLabel: 'Taker' },
    { ...OPTIONAL_ALL, id: 'highlight', type: 'highlight',       key: 'h', label: 'Highlight',       personLabel: 'Who', askText: 'prompt', textLabel: 'What happened' },
    { ...OPTIONAL_ALL, id: 'foul',      type: 'foul',            key: 'f', label: 'Foul',            personLabel: 'Committed by', textLabel: 'Note' },
    { ...SCORER, id: 'save',            type: 'save',            key: 's', label: 'Save',            personLabel: 'Goalkeeper', personOptional: true },
    // Type-step keys: K, T and W never clash with team shortcuts, which only apply in the team step.
    { ...MARKER, id: 'kick_off',        type: 'kick_off',        key: 'k', label: 'Kick off',        marker: true },
    { ...MARKER, id: 'half_time',       type: 'half_time',       key: 't', label: 'Half time',       marker: true },
    { ...MARKER, id: 'final_whistle',   type: 'final_whistle',   key: 'w', label: 'Final whistle',   marker: true },
]

/** The touch type list: grouped, in this order (Save · Foul · Highlight differs from the keyboard order above). */
export const PICKER_GROUPS: { label: string; ids: PickerOptionId[] }[] = [
    { label: 'Goals', ids: ['goal', 'goal_pen', 'own_goal'] },
    { label: 'Penalties', ids: ['penalty_awarded', 'penalty_missed'] },
    { label: 'Other', ids: ['save', 'foul', 'highlight'] },
    { label: 'Match', ids: ['kick_off', 'half_time', 'final_whistle'] },
]

export function optionForKey(key: string): PickerOption | undefined {
    const k = key.toLowerCase()
    return PICKER_OPTIONS.find((o) => o.key === k)
}

/** Broadcast-style label for outputs: chapters, descriptions, captions. */
export function eventLabel(e: Pick<MatchEvent, 'type' | 'pen'>): string {
    return e.type === 'goal' && e.pen ? 'Goal (pen)' : EVENT_META[e.type].label
}

/** The label in the app's own controls (picker, edit sheet, event log): "Penalty goal", not "Goal (pen)". */
export function controlLabel(e: Pick<MatchEvent, 'type' | 'pen'>): string {
    return e.type === 'goal' && e.pen ? 'Penalty goal' : EVENT_META[e.type].label
}

/** A note squeezed onto one line, cut at a word with an ellipsis when longer than `max`. */
export function shortNote(notes: string | undefined, max = 40): string {
    const clean = (notes ?? '').trim().replace(/\s+/g, ' ')
    if (clean.length <= max) return clean
    const cut = clean.slice(0, max - 1)
    const space = cut.lastIndexOf(' ')
    return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** One-line description: `Highlight · Sam — nutmeg on the wing`. */
export function eventSummary(e: Pick<MatchEvent, 'type' | 'pen' | 'scorer' | 'notes'>): string {
    const note = shortNote(e.notes)
    return `${eventLabel(e)}${e.scorer ? ` · ${e.scorer}` : ''}${note ? ` — ${note}` : ''}`
}

export function eventIcon(e: Pick<MatchEvent, 'type'>): string {
    return EVENT_META[e.type].icon
}

export function isScoring(e: Pick<MatchEvent, 'type'>): boolean {
    return EVENT_META[e.type].scoring
}

/** Kick off / Final whistle markers. */
export function isMarker<T extends Pick<MatchEvent, 'type'>>(e: T): e is T & { type: MarkerType } {
    return EVENT_META[e.type].marker === true
}

const LEGACY_TYPES: Record<string, EventType> = { moment: 'highlight', card: 'foul' }

/** `whitesAttackLeft`: the old direction flag, needed only to turn a stored 'left' / 'right' replay framing into a team's goal. */
export function migrateEvent(raw: Omit<MatchEvent, 'type' | 'replayCrop'> & { type?: string; replayCrop?: unknown }, whitesAttackLeft = true): MatchEvent {
    const t = raw.type ?? 'goal'
    const type = (LEGACY_TYPES[t] ?? (t in EVENT_META ? t : 'highlight')) as EventType
    const { replayCrop, ...rest } = raw
    const crop = migrateReplayCrop(replayCrop, whitesAttackLeft)
    return { ...rest, type, ...(crop !== undefined ? { replayCrop: crop } : {}) }
}
