import type { EventType } from '../types'

export const EVENT_COLORS: Record<EventType, string> = {
    goal: '#f72585',
    save: '#4cc9f0',
    foul: '#f4a261',
    card: '#fee440',
    moment: '#a0a0a0',
}

export const EVENT_LABELS: Record<EventType, string> = {
    goal: 'Goal',
    save: 'Save',
    foul: 'Foul',
    card: 'Card',
    moment: 'Moment',
}

export function getEventColor(type: EventType): string {
    return EVENT_COLORS[type]
}
