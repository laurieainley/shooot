import { describe, it, expect } from 'vitest'
import { EVENT_META } from './eventTypes'
import { EVENT_ICON_KEYS, eventIconKey, eventIconLabel, isGoalIcon } from './eventIcon'
import type { EventType } from '../types'

describe('eventIconKey', () => {
    it('should give every event type an icon', () => {
        for (const type of Object.keys(EVENT_META) as EventType[]) {
            expect(EVENT_ICON_KEYS).toContain(eventIconKey({ type }))
        }
    })
    it('should give a penalty goal its own icon, distinct from a goal', () => {
        expect(eventIconKey({ type: 'goal' })).toBe('goal')
        expect(eventIconKey({ type: 'goal', pen: false })).toBe('goal')
        expect(eventIconKey({ type: 'goal', pen: true })).toBe('penalty_goal')
    })
    it('should map the other types one to one', () => {
        expect(eventIconKey({ type: 'save' })).toBe('save')
        expect(eventIconKey({ type: 'foul' })).toBe('foul')
        expect(eventIconKey({ type: 'own_goal' })).toBe('own_goal')
    })
    it('should use every icon key for some event', () => {
        const used = new Set([
            ...(Object.keys(EVENT_META) as EventType[]).map((type) => eventIconKey({ type })),
            eventIconKey({ type: 'goal', pen: true }),
        ])
        expect([...used].sort()).toEqual([...EVENT_ICON_KEYS].sort())
    })
})

describe('eventIconLabel', () => {
    it('should name every icon with its control label', () => {
        expect(eventIconLabel({ type: 'goal' })).toBe('Goal')
        expect(eventIconLabel({ type: 'goal', pen: true })).toBe('Penalty goal')
        expect(eventIconLabel({ type: 'own_goal' })).toBe('Own goal')
        expect(eventIconLabel({ type: 'save' })).toBe('Save')
        expect(eventIconLabel({ type: 'final_whistle' })).toBe('Final whistle')
    })
})

describe('isGoalIcon', () => {
    it('should be true only for goals and penalty goals (the lime icons)', () => {
        expect(EVENT_ICON_KEYS.filter(isGoalIcon)).toEqual(['goal', 'penalty_goal'])
    })
})
