import { describe, it, expect } from 'vitest'
import { PICKER_OPTIONS, eventLabel, eventIcon, isScoring, migrateEvent, optionForKey, EVENT_META } from './eventTypes'
import type { MatchEvent } from '../types'

const ev = (extra: Partial<MatchEvent>): MatchEvent => ({ id: 'e', matchTimeSec: 1, type: 'goal', ...extra })

describe('PICKER_OPTIONS', () => {
    it('should list goal first and give every option a unique key', () => {
        expect(PICKER_OPTIONS[0].id).toBe('goal')
        const keys = PICKER_OPTIONS.map((o) => o.key)
        expect(new Set(keys).size).toBe(keys.length)
        expect(keys).toEqual(['g', 'p', 'o', 'a', 'x', 'h', 'f', 's'])
    })
})

describe('optionForKey', () => {
    it('should find options case-insensitively', () => {
        expect(optionForKey('H')?.id).toBe('highlight')
        expect(optionForKey('p')?.id).toBe('goal_pen')
        expect(optionForKey('z')).toBeUndefined()
    })
})

describe('eventLabel', () => {
    it('should label penalty goals as Goal (pen)', () => {
        expect(eventLabel(ev({ pen: true }))).toBe('Goal (pen)')
        expect(eventLabel(ev({}))).toBe('Goal')
        expect(eventLabel(ev({ type: 'penalty_missed' }))).toBe('Penalty missed')
    })
})

describe('eventIcon', () => {
    it('should return an icon for every type', () => {
        for (const t of Object.keys(EVENT_META)) expect(eventIcon(ev({ type: t as MatchEvent['type'] }))).not.toBe('')
    })
})

describe('isScoring', () => {
    it('should count goals and own goals only', () => {
        expect(isScoring(ev({}))).toBe(true)
        expect(isScoring(ev({ type: 'own_goal' }))).toBe(true)
        expect(isScoring(ev({ type: 'penalty_awarded' }))).toBe(false)
        expect(isScoring(ev({ type: 'highlight' }))).toBe(false)
    })
})

describe('migrateEvent', () => {
    it('should map legacy types and default missing type to goal', () => {
        expect(migrateEvent({ id: 'a', matchTimeSec: 1, type: 'moment' }).type).toBe('highlight')
        expect(migrateEvent({ id: 'a', matchTimeSec: 1, type: 'card' }).type).toBe('foul')
        expect(migrateEvent({ id: 'a', matchTimeSec: 1 }).type).toBe('goal')
        expect(migrateEvent({ id: 'a', matchTimeSec: 1, type: 'save' }).type).toBe('save')
    })
})
