import { describe, it, expect } from 'vitest'
import { eventTone, tagText, stripTick, TONE_CLASS } from './eventStyle'

describe('eventTone', () => {
    it('should make a normal goal the lime-fill tone', () => {
        expect(eventTone({ type: 'goal', pen: false })).toBe('goal')
        expect(eventTone({ type: 'goal' })).toBe('goal')
    })
    it('should make a penalty goal a lime outline, distinct from a goal', () => {
        expect(eventTone({ type: 'goal', pen: true })).toBe('pen-goal')
    })
    it('should make an own goal a chalk fill (never red)', () => {
        expect(eventTone({ type: 'own_goal' })).toBe('own-goal')
    })
    it('should give save, foul, highlight and the penalties the quiet surface tone', () => {
        for (const type of ['save', 'foul', 'highlight', 'penalty_conceded', 'penalty_missed'] as const) {
            expect(eventTone({ type })).toBe('other')
        }
    })
    it('should give kick off, half time and final whistle the marker tone', () => {
        for (const type of ['kick_off', 'half_time', 'final_whistle'] as const) expect(eventTone({ type })).toBe('marker')
    })
})

describe('tagText', () => {
    it('should label an own goal OG when short and Own goal in full', () => {
        expect(tagText({ type: 'own_goal' }, true)).toBe('OG')
        expect(tagText({ type: 'own_goal' }, false)).toBe('Own goal')
    })
    it('should shorten the penalties for tight rows', () => {
        expect(tagText({ type: 'goal', pen: true }, true)).toBe('Pen goal')
        expect(tagText({ type: 'penalty_conceded' }, true)).toBe('Pen conceded')
        expect(tagText({ type: 'penalty_missed' }, true)).toBe('Pen missed')
    })

    it('should use the control label for everything else', () => {
        expect(tagText({ type: 'goal', pen: true }, false)).toBe('Penalty goal')
        expect(tagText({ type: 'goal' }, true)).toBe('Goal')
        expect(tagText({ type: 'save' }, true)).toBe('Save')
    })
})

describe('TONE_CLASS', () => {
    it('should have one class per tone', () => {
        expect(Object.keys(TONE_CLASS).sort()).toEqual(['goal', 'marker', 'other', 'own-goal', 'pen-goal'])
    })
})

describe('stripTick', () => {
    it('should draw goals and penalty goals as lime ticks', () => {
        expect(stripTick({ type: 'goal' })).toEqual({ tick: 'goal' })
        expect(stripTick({ type: 'goal', pen: true })).toEqual({ tick: 'goal' })
    })
    it('should draw an own goal as a chalk tick labelled OG', () => {
        expect(stripTick({ type: 'own_goal' })).toEqual({ tick: 'own-goal', label: 'OG' })
    })
    it('should draw a missed penalty as an open chalk ring', () => {
        expect(stripTick({ type: 'penalty_missed' })).toEqual({ tick: 'miss' })
    })
    it('should draw every other moment as a grey tick', () => {
        for (const type of ['save', 'foul', 'highlight', 'penalty_conceded'] as const) expect(stripTick({ type })).toEqual({ tick: 'other' })
    })
})
