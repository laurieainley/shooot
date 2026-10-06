import { describe, it, expect } from 'vitest'
import { wantsReplay } from './replays'
import type { MatchEvent } from '../types'

const ev = (extra: Partial<MatchEvent>): MatchEvent => ({ id: 'e', matchTimeSec: 10, type: 'goal', ...extra })

describe('wantsReplay', () => {
    it('should default to true for scoring events and false otherwise', () => {
        expect(wantsReplay(ev({}))).toBe(true)
        expect(wantsReplay(ev({ type: 'own_goal' }))).toBe(true)
        expect(wantsReplay(ev({ type: 'highlight' }))).toBe(false)
    })
    it('should respect an explicit override either way', () => {
        expect(wantsReplay(ev({ replay: false }))).toBe(false)
        expect(wantsReplay(ev({ type: 'save', replay: true }))).toBe(true)
    })
})

describe('wantsReplay — markers', () => {
    it('should never replay Kick off or Final whistle, even when asked', () => {
        expect(wantsReplay(ev({ type: 'kick_off' }))).toBe(false)
        expect(wantsReplay(ev({ type: 'final_whistle', replay: true }))).toBe(false)
    })
})
