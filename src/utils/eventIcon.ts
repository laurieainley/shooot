import type { EventType, MatchEvent } from '../types'
import { controlLabel } from './eventTypes'

/** One glyph per event kind (components/icons). A penalty goal is its own glyph: a football with a "P". */
export type EventIconKey =
    | 'goal' | 'penalty_goal' | 'own_goal' | 'penalty_missed' | 'penalty_conceded'
    | 'save' | 'foul' | 'highlight' | 'kick_off' | 'half_time' | 'final_whistle'

type Typed = Pick<MatchEvent, 'type'> & { pen?: boolean }

export const EVENT_ICON_KEYS: EventIconKey[] = [
    'goal', 'penalty_goal', 'own_goal', 'penalty_missed', 'penalty_conceded',
    'save', 'foul', 'highlight', 'kick_off', 'half_time', 'final_whistle',
]

const BY_TYPE: Record<Exclude<EventType, 'goal'>, EventIconKey> = {
    own_goal: 'own_goal', penalty_missed: 'penalty_missed', penalty_conceded: 'penalty_conceded',
    save: 'save', foul: 'foul', highlight: 'highlight', kick_off: 'kick_off', half_time: 'half_time', final_whistle: 'final_whistle',
}

/** The glyph an event is drawn with (strip, rows, picker, edit sheet). */
export function eventIconKey(e: Typed): EventIconKey {
    if (e.type === 'goal') return e.pen ? 'penalty_goal' : 'goal'
    return BY_TYPE[e.type]
}

/** The accessible name of an event's icon: the control label ("Penalty goal", "Own goal"). */
export function eventIconLabel(e: Typed): string {
    return controlLabel({ type: e.type, pen: e.pen })
}

/** Goals (penalties included) are the only lime icons; an own goal is a chalk football. */
export function isGoalIcon(key: EventIconKey): boolean {
    return key === 'goal' || key === 'penalty_goal'
}
