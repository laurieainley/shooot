import { describe, it, expect } from 'vitest'
import { getEventColor, EVENT_COLORS, EVENT_LABELS } from './eventColors'

describe('getEventColor', () => {
    it('should return pink for goal type', () => {
        expect(getEventColor('goal')).toBe('#f72585')
    })

    it('should return a colour for every event type', () => {
        const types = ['goal', 'save', 'foul', 'card', 'moment'] as const
        for (const type of types) {
            expect(getEventColor(type)).toBeTruthy()
        }
    })
})

describe('EVENT_LABELS', () => {
    it('should have a label for every event type', () => {
        const types = ['goal', 'save', 'foul', 'card', 'moment'] as const
        for (const type of types) {
            expect(EVENT_LABELS[type]).toBeTruthy()
        }
    })
})
