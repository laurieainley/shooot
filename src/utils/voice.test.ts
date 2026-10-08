import { describe, it, expect } from 'vitest'
import type { EventType, MatchEvent } from '../types'
import { emptyLogLine, POLISHING, polishingChip, REEL_READY, GOAL_MARKED, goalMarkedFor } from './voice'

describe('voice', () => {
    it('should greet an empty log with the brand line, then say what to do', () => {
        expect(emptyLogLine(false, true)).toEqual({ lead: 'No goals yet. Classic.', hint: 'Load a video, then press', key: 'G', tail: 'while it plays.' })
        expect(emptyLogLine(false, false).hint).toBe('Press')
        expect(emptyLogLine(true, true)).toEqual({ lead: 'No goals yet. Classic.', hint: 'Load a video, then tap ＋ while it plays.' })
        expect(emptyLogLine(true, false).hint).toBe('Tap ＋ while the video plays.')
    })

    it('should report render progress as polishing the tap-ins, the chip rounded to a whole percent', () => {
        expect(POLISHING).toBe('Polishing the tap-ins…')
        expect(polishingChip(0.644)).toBe('Polishing… 64%')
        expect(polishingChip(0)).toBe('Polishing… 0%')
        expect(polishingChip(1.4)).toBe('Polishing… 100%')
    })

    it('should word the done and goal-marked states', () => {
        expect(REEL_READY).toBe("Reel ready. Group chat won't know what's hit it.")
        expect(GOAL_MARKED).toBe('Goal tagged.')
    })
})

describe('goalMarkedFor', () => {
    const goal = (id: string, type: EventType = 'goal'): Pick<MatchEvent, 'id' | 'type'> => ({ id, type })
    it('should fire when exactly one scoring event was added', () => {
        expect(goalMarkedFor([goal('a')], [goal('a'), goal('b')])).toBe('b')
        expect(goalMarkedFor([goal('a')], [goal('a'), goal('b', 'own_goal')])).toBe('b')
    })
    it('should not fire for other events, removals, or bulk changes (import / undo)', () => {
        expect(goalMarkedFor([], [goal('a', 'save')])).toBeNull()
        expect(goalMarkedFor([goal('a')], [])).toBeNull()
        expect(goalMarkedFor([], [goal('a'), goal('b')])).toBeNull()
        expect(goalMarkedFor([goal('a')], [goal('a')])).toBeNull()
    })
})
