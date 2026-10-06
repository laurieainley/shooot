import { describe, it, expect } from 'vitest'
import { isMarker } from './eventTypes'
import { PICKER_GROUPS, PICKER_OPTIONS, controlLabel, eventLabel, eventIcon, isScoring, migrateEvent, optionForKey, EVENT_META, shortNote, eventSummary } from './eventTypes'
import type { MatchEvent } from '../types'

const ev = (extra: Partial<MatchEvent>): MatchEvent => ({ id: 'e', matchTimeSec: 1, type: 'goal', ...extra })

describe('PICKER_OPTIONS', () => {
    it('should list goal first and give every option a unique key', () => {
        expect(PICKER_OPTIONS[0].id).toBe('goal')
        const keys = PICKER_OPTIONS.map((o) => o.key)
        expect(new Set(keys).size).toBe(keys.length)
        expect(keys).toEqual(['g', 'p', 'o', 'a', 'x', 'h', 'f', 's', 'k', 'w'])
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

describe('controlLabel', () => {
    it('should call a penalty goal "Penalty goal" in the app\'s controls while outputs keep "Goal (pen)"', () => {
        expect(controlLabel(ev({ pen: true }))).toBe('Penalty goal')
        expect(eventLabel(ev({ pen: true }))).toBe('Goal (pen)')
        expect(PICKER_OPTIONS.find((o) => o.id === 'goal_pen')?.label).toBe('Penalty goal')
    })

    it('should match eventLabel for every other type', () => {
        expect(controlLabel(ev({}))).toBe('Goal')
        expect(controlLabel(ev({ type: 'own_goal' }))).toBe('Own goal')
        expect(controlLabel(ev({ type: 'final_whistle' }))).toBe('Final whistle')
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

describe('match markers', () => {
    it('should list Kick off (K) and Final whistle (W) after the normal types', () => {
        const ids = PICKER_OPTIONS.map((o) => o.id)
        expect(ids.slice(-2)).toEqual(['kick_off', 'final_whistle'])
        expect(optionForKey('k')?.id).toBe('kick_off')
        expect(optionForKey('w')?.id).toBe('final_whistle')
        for (const o of PICKER_OPTIONS.slice(-2)) expect(o).toMatchObject({ askTeam: false, askScorer: false, askText: false, marker: true })
    })

    it('should never score and be recognised as markers', () => {
        expect(isScoring({ type: 'kick_off' })).toBe(false)
        expect(isScoring({ type: 'final_whistle' })).toBe(false)
        expect(isMarker({ type: 'kick_off' })).toBe(true)
        expect(isMarker({ type: 'final_whistle' })).toBe(true)
        expect(isMarker({ type: 'goal' })).toBe(false)
        expect(eventLabel({ type: 'kick_off' })).toBe('Kick off')
        expect(eventLabel({ type: 'final_whistle' })).toBe('Final whistle')
    })

    it('should keep marker types when migrating', () => {
        expect(migrateEvent({ id: 'k', matchTimeSec: 5, type: 'kick_off' }).type).toBe('kick_off')
    })
})

describe('PICKER_GROUPS', () => {
    it('should list every picker option exactly once, in the touch order', () => {
        const ids = PICKER_GROUPS.flatMap((g) => g.ids)
        expect([...ids].sort()).toEqual(PICKER_OPTIONS.map((o) => o.id).sort())
        expect(ids).toEqual(['goal', 'goal_pen', 'own_goal', 'penalty_awarded', 'penalty_missed', 'save', 'foul', 'highlight', 'kick_off', 'final_whistle'])
        expect(PICKER_GROUPS.map((g) => g.label)).toEqual(['Goals', 'Penalties', 'Other', 'Match'])
    })
})
