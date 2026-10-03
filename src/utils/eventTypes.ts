import type { EventType, MatchEvent } from '../types'

export type EventMeta = {
    label: string
    icon: string
    color: string
    scoring: boolean
}

export const EVENT_META: Record<EventType, EventMeta> = {
    goal:            { label: 'Goal',            icon: '⚽', color: '#f72585', scoring: true },
    own_goal:        { label: 'Own goal',        icon: '⚽', color: '#e63946', scoring: true },
    penalty_awarded: { label: 'Penalty awarded', icon: 'Ⓟ', color: '#fee440', scoring: false },
    penalty_missed:  { label: 'Penalty missed',  icon: 'Ⓟ', color: '#a0a0a0', scoring: false },
    highlight:       { label: 'Highlight',       icon: '★', color: '#4cc9f0', scoring: false },
    foul:            { label: 'Foul',            icon: '🟨', color: '#f4a261', scoring: false },
    save:            { label: 'Save',            icon: '🧤', color: '#4cc9f0', scoring: false },
}

export type PickerOptionId = 'goal' | 'goal_pen' | 'own_goal' | 'penalty_awarded' | 'penalty_missed' | 'highlight' | 'foul' | 'save'

export type PickerOption = {
    id: PickerOptionId
    type: EventType
    pen: boolean
    key: string          // lower-case shortcut in the picker
    label: string
    askTeam: boolean
    askScorer: boolean
}

export const PICKER_OPTIONS: PickerOption[] = [
    { id: 'goal',            type: 'goal',            pen: false, key: 'g', label: 'Goal',            askTeam: true,  askScorer: true },
    { id: 'goal_pen',        type: 'goal',            pen: true,  key: 'p', label: 'Goal (pen)',      askTeam: true,  askScorer: true },
    { id: 'own_goal',        type: 'own_goal',        pen: false, key: 'o', label: 'Own goal',        askTeam: true,  askScorer: true },
    { id: 'penalty_awarded', type: 'penalty_awarded', pen: false, key: 'a', label: 'Penalty awarded', askTeam: true,  askScorer: false },
    { id: 'penalty_missed',  type: 'penalty_missed',  pen: false, key: 'x', label: 'Penalty missed',  askTeam: true,  askScorer: true },
    { id: 'highlight',       type: 'highlight',       pen: false, key: 'h', label: 'Highlight',       askTeam: false, askScorer: false },
    { id: 'foul',            type: 'foul',            pen: false, key: 'f', label: 'Foul',            askTeam: false, askScorer: false },
    { id: 'save',            type: 'save',            pen: false, key: 's', label: 'Save',            askTeam: true,  askScorer: true },
]

export function optionForKey(key: string): PickerOption | undefined {
    const k = key.toLowerCase()
    return PICKER_OPTIONS.find((o) => o.key === k)
}

export function eventLabel(e: Pick<MatchEvent, 'type' | 'pen'>): string {
    return e.type === 'goal' && e.pen ? 'Goal (pen)' : EVENT_META[e.type].label
}

export function eventIcon(e: Pick<MatchEvent, 'type'>): string {
    return EVENT_META[e.type].icon
}

export function isScoring(e: Pick<MatchEvent, 'type'>): boolean {
    return EVENT_META[e.type].scoring
}

const LEGACY_TYPES: Record<string, EventType> = { moment: 'highlight', card: 'foul' }

export function migrateEvent(raw: Omit<MatchEvent, 'type'> & { type?: string }): MatchEvent {
    const t = raw.type ?? 'goal'
    const type = (LEGACY_TYPES[t] ?? (t in EVENT_META ? t : 'highlight')) as EventType
    return { ...raw, type }
}
