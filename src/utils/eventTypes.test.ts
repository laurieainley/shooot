import { describe, it, expect } from 'vitest'
import { PICKER_OPTIONS, eventLabel, eventIcon, isScoring, migrateEvent, optionForKey, EVENT_META, shortNote, eventSummary } from './eventTypes'
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

describe('PICKER_OPTIONS — per-type details', () => {
    const opt = (id: string) => PICKER_OPTIONS.find((o) => o.id === id)!

    it('should label the person step per type', () => {
        expect(opt('goal').personLabel).toBe('Scorer')
        expect(opt('goal_pen').personLabel).toBe('Penalty taker')
        expect(opt('own_goal').personLabel).toBe('Own goal by')
        expect(opt('penalty_missed').personLabel).toBe('Taker')
        expect(opt('save').personLabel).toBe('Goalkeeper')
        expect(opt('highlight').personLabel).toBe('Who')
        expect(opt('foul').personLabel).toBe('Committed by')
        expect(opt('penalty_awarded').askScorer).toBe(false)
    })

    it('should make the goalkeeper, highlight and foul people optional', () => {
        expect(PICKER_OPTIONS.filter((o) => o.personOptional).map((o) => o.id)).toEqual(['highlight', 'foul', 'save'])
    })

    it('should ask highlight and foul for an optional team and a text', () => {
        expect(opt('highlight')).toMatchObject({ askTeam: true, teamOptional: true, askText: 'prompt', textLabel: 'What happened' })
        expect(opt('foul')).toMatchObject({ askTeam: true, teamOptional: true, askText: 'optional', textLabel: 'Note' })
        expect(PICKER_OPTIONS.filter((o) => o.askText).map((o) => o.id)).toEqual(['highlight', 'foul'])
        expect(PICKER_OPTIONS.filter((o) => o.teamOptional).map((o) => o.id)).toEqual(['highlight', 'foul'])
    })
})

describe('shortNote', () => {
    it('should trim and collapse whitespace', () => {
        expect(shortNote('  nutmeg   on the wing ')).toBe('nutmeg on the wing')
        expect(shortNote(undefined)).toBe('')
    })

    it('should shorten long notes at a word with an ellipsis', () => {
        const s = shortNote('a lovely curling shot from outside the box into the top corner', 30)
        expect(s.length).toBeLessThanOrEqual(30)
        expect(s).toBe('a lovely curling shot from…')
    })
})

describe('eventSummary', () => {
    it('should join label, person and short note', () => {
        expect(eventSummary({ type: 'highlight', scorer: 'Sam', notes: 'nutmeg on the wing' })).toBe('Highlight · Sam — nutmeg on the wing')
        expect(eventSummary({ type: 'foul', notes: 'late' })).toBe('Foul — late')
        expect(eventSummary({ type: 'goal', pen: true, scorer: 'Jo' })).toBe('Goal (pen) · Jo')
        expect(eventSummary({ type: 'save' })).toBe('Save')
    })
})
