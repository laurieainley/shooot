import { describe, it, expect } from 'vitest'
import { isMarker } from './eventTypes'
import { PICKER_GROUPS, PICKER_OPTIONS, controlLabel, eventLabel, eventIcon, isScoring, migrateEvent, optionForKey, EVENT_META, shortNote, eventSummary, assistOf, controlSummary } from './eventTypes'
import type { MatchEvent, Team } from '../types'

const ev = (extra: Partial<MatchEvent>): MatchEvent => ({ id: 'e', matchTimeSec: 1, type: 'goal', ...extra })

describe('PICKER_OPTIONS', () => {
    it('should list goal first and give every option a unique key', () => {
        expect(PICKER_OPTIONS[0].id).toBe('goal')
        const keys = PICKER_OPTIONS.map((o) => o.key)
        expect(new Set(keys).size).toBe(keys.length)
        expect(keys).toEqual(['g', 'p', 'o', 'a', 'x', 'h', 'f', 's', 'k', 't', 'w'])
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
        expect(eventLabel(ev({ type: 'penalty_conceded' }))).toBe('Penalty conceded')
        expect(controlLabel(ev({ type: 'penalty_conceded' }))).toBe('Penalty conceded')
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
        expect(isScoring(ev({ type: 'penalty_conceded' }))).toBe(false)
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

describe('migrateEvent — penalty_awarded to penalty_conceded', () => {
    const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: ['Sam'] }, { name: 'Colours', color: '#f00', roster: ['Jo'] }]
    const old = (extra: object) => ({ id: 'p', matchTimeSec: 5, type: 'penalty_awarded', ...extra }) as Parameters<typeof migrateEvent>[0]

    it('should become penalty_conceded with the team flipped to the other team', () => {
        expect(migrateEvent(old({ team: 'Whites' }), true, teams)).toMatchObject({ type: 'penalty_conceded', team: 'Colours' })
        expect(migrateEvent(old({ team: 'Colours' }), true, teams)).toMatchObject({ type: 'penalty_conceded', team: 'Whites' })
    })
    it('should leave an unset team unset', () => {
        expect(migrateEvent(old({}), true, teams).team).toBeUndefined()
    })
    it('should leave the team alone when there are not two teams', () => {
        expect(migrateEvent(old({ team: 'Whites' }), true, []).type).toBe('penalty_conceded')
        expect(migrateEvent(old({ team: 'Whites' }), true, []).team).toBe('Whites')
        expect(migrateEvent(old({ team: 'Whites' })).team).toBe('Whites')
    })
    it('should clear a person from the awarding roster but keep one from elsewhere', () => {
        expect(migrateEvent(old({ team: 'Whites', scorer: 'sam' }), true, teams).scorer).toBeUndefined()
        expect(migrateEvent(old({ team: 'Whites', scorer: 'Jo' }), true, teams).scorer).toBe('Jo')
        expect(migrateEvent(old({ team: 'Whites', scorer: 'Stranger' }), true, teams).scorer).toBe('Stranger')
    })
    it('should not touch events already converted', () => {
        expect(migrateEvent({ id: 'c', matchTimeSec: 1, type: 'penalty_conceded', team: 'Whites' }, true, teams).team).toBe('Whites')
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
        expect(opt('penalty_conceded')).toMatchObject({ askScorer: true, personLabel: 'Conceded by', personOptional: true })
    })

    it('should make the goalkeeper, highlight and foul people optional', () => {
        expect(PICKER_OPTIONS.filter((o) => o.personOptional).map((o) => o.id)).toEqual(['penalty_conceded', 'highlight', 'foul', 'save'])
    })

    it('should ask highlight and foul for an optional team and a text', () => {
        expect(opt('highlight')).toMatchObject({ askTeam: true, teamOptional: true, askText: 'prompt', textLabel: 'What happened' })
        expect(opt('foul')).toMatchObject({ askTeam: true, teamOptional: true, askText: 'optional', textLabel: 'Note' })
        expect(PICKER_OPTIONS.filter((o) => o.askText).map((o) => o.id)).toEqual(PICKER_OPTIONS.filter((o) => !o.marker).map((o) => o.id)) // every event but the match markers
        expect(PICKER_OPTIONS.filter((o) => o.askText === 'prompt').map((o) => o.id)).toEqual(['highlight'])
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
        expect(ids.slice(-3)).toEqual(['kick_off', 'half_time', 'final_whistle'])
        expect(optionForKey('k')?.id).toBe('kick_off')
        expect(optionForKey('t')?.id).toBe('half_time')
        expect(optionForKey('w')?.id).toBe('final_whistle')
        for (const o of PICKER_OPTIONS.slice(-3)) expect(o).toMatchObject({ askTeam: false, askScorer: false, askText: false, marker: true })
    })

    it('should never score and be recognised as markers', () => {
        expect(isScoring({ type: 'kick_off' })).toBe(false)
        expect(isScoring({ type: 'final_whistle' })).toBe(false)
        expect(isMarker({ type: 'kick_off' })).toBe(true)
        expect(isMarker({ type: 'final_whistle' })).toBe(true)
        expect(isMarker({ type: 'half_time' })).toBe(true)
        expect(isScoring({ type: 'half_time' })).toBe(false)
        expect(eventLabel({ type: 'half_time' })).toBe('Half time')
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
        expect(ids).toEqual(['goal', 'goal_pen', 'own_goal', 'penalty_conceded', 'penalty_missed', 'save', 'foul', 'highlight', 'kick_off', 'half_time', 'final_whistle'])
        expect(PICKER_GROUPS.map((g) => g.label)).toEqual(['Goals', 'Penalties', 'Other', 'Match'])
    })
})

describe('assist text', () => {
    it('should only count an assist on a normal goal', () => {
        expect(assistOf({ type: 'goal', assist: ' Jo ' })).toBe('Jo')
        expect(assistOf({ type: 'goal', pen: true, assist: 'Jo' })).toBeUndefined()
        expect(assistOf({ type: 'own_goal', assist: 'Jo' })).toBeUndefined()
        expect(assistOf({ type: 'goal', assist: '  ' })).toBeUndefined()
    })
    it('should give a full and a short row text', () => {
        expect(controlSummary({ type: 'goal', scorer: 'Sam', assist: 'Jo' })).toEqual({ full: 'Goal · Sam (assist Jo)', short: 'Goal · Sam, Jo' })
        expect(controlSummary({ type: 'goal', scorer: 'Sam' })).toEqual({ full: 'Goal · Sam', short: 'Goal · Sam' })
        expect(controlSummary({ type: 'goal', pen: true, scorer: 'Sam', assist: 'Jo' }).full).toBe('Penalty goal · Sam')
    })
    it('should carry the assist in the one-line summary', () => {
        expect(eventSummary({ type: 'goal', scorer: 'Sam', assist: 'Jo' })).toBe('Goal · Sam (assist Jo)')
    })
    it('should ask for an assist on the normal goal option only', () => {
        expect(PICKER_OPTIONS.filter((o) => o.askAssist).map((o) => o.id)).toEqual(['goal'])
    })
})
