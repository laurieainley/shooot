import { describe, it, expect } from 'vitest'
import { fullMatchDescription, highlightsDescription } from './descriptions'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: [], initials: 'haw' }, { name: 'Colours', color: '#f00', roster: [], initials: 'lio' }]
const events: MatchEvent[] = [
    { id: 'k', matchTimeSec: 60, sourceFileIndex: 0, type: 'kick_off' },
    { id: 'a', matchTimeSec: 200, sourceFileIndex: 0, type: 'goal', team: 'Whites', scorer: 'Sam' },
    { id: 'h', matchTimeSec: 400, sourceFileIndex: 0, type: 'highlight', scorer: 'Jo', notes: 'nutmeg' },
    { id: 'b', matchTimeSec: 20, sourceFileIndex: 1, type: 'goal', team: 'Colours', scorer: 'Priya' },
    { id: 'w', matchTimeSec: 300, sourceFileIndex: 1, type: 'final_whistle' },
    { id: 'late', matchTimeSec: 500, sourceFileIndex: 1, type: 'highlight' },
]
const base = { events, teams, cumulativeOffsets: [0, 600], before: 10, after: 4 }

describe('highlightsDescription', () => {
    it('should be the score, the highlight chapters and the scorers, separated by blank lines', () => {
        const text = highlightsDescription({ ...base, introSec: 0 })
        expect(text.split('\n')).toEqual([
            'Whites 1–1 Colours',
            '',
            '00:00 Goal 1-0 (Whites) Sam',
            '00:15 Highlight Jo: nutmeg',
            '00:30 Goal 1-1 (Colours) Priya',
            '00:45 Highlight',
            '',
            'Goalscorers',
            'Priya: 1',
            'Sam: 1',
        ])
    })

    it('should estimate without key-frame slack when the video is re-encoded (cuts are frame-exact)', () => {
        const exact = highlightsDescription({ ...base, introSec: 0, reencoded: true }).split('\n')
        expect(exact.slice(2, 6)).toEqual(['00:00 Goal 1-0 (Whites) Sam', '00:14 Highlight Jo: nutmeg', '00:28 Goal 1-1 (Colours) Priya', '00:42 Highlight'])
    })

    it('should shift chapters after the title card but keep the first at 00:00', () => {
        const lines = highlightsDescription({ ...base, introSec: 4 }).split('\n')
        expect(lines.slice(2, 4)).toEqual(['00:00 Goal 1-0 (Whites) Sam', '00:19 Highlight Jo: nutmeg'])
    })
})

describe('fullMatchDescription', () => {
    it('should time chapters from kick-off and stop at the final whistle', () => {
        const text = fullMatchDescription({ ...base, introSec: 0 })
        expect(text.split('\n')).toEqual([
            'Whites 1–1 Colours',
            '',
            '00:00 Kick off',
            '02:10 Goal 1-0 (Whites) Sam',
            '05:30 Highlight Jo: nutmeg',
            '09:10 Goal 1-1 (Colours) Priya',
            '',
            'Goalscorers',
            'Priya: 1',
            'Sam: 1',
        ])
    })

    it('should add the title card length to every chapter after kick-off', () => {
        const lines = fullMatchDescription({ ...base, introSec: 4 }).split('\n')
        expect(lines[2]).toBe('00:00 Kick off')
        expect(lines[3]).toBe('02:14 Goal 1-0 (Whites) Sam')
    })
})

describe('descriptions without assists', () => {
    const withAssist = events.map((e) => (e.id === 'a' ? { ...e, assist: 'Jo' } : e))
    it('should leave assists out of the chapters and the scorers', () => {
        for (const text of [highlightsDescription({ ...base, events: withAssist, introSec: 0 }), fullMatchDescription({ ...base, events: withAssist, introSec: 0 })]) {
            expect(text).not.toMatch(/assist/i)
            expect(text.split('\n').slice(-3)).toEqual(['Goalscorers', 'Priya: 1', 'Sam: 1'])
        }
    })
})

describe('descriptions with own goals and pens', () => {
    it('should tally own goals and mark pens in the Goalscorers block', () => {
        const evs: MatchEvent[] = [
            { id: 'a', matchTimeSec: 10, sourceFileIndex: 0, type: 'goal', team: 'Whites', scorer: 'DJ' },
            { id: 'b', matchTimeSec: 20, sourceFileIndex: 0, type: 'goal', team: 'Whites', scorer: 'DJ', pen: true },
            { id: 'c', matchTimeSec: 30, sourceFileIndex: 0, type: 'own_goal', team: 'Whites', scorer: 'Ade', notes: 'deflected' },
        ]
        const text = highlightsDescription({ ...base, events: evs, introSec: 0 })
        expect(text.split('\n')[0]).toBe('Whites 3–0 Colours')
        expect(text).toContain('Own goal 3-0 (Whites) Ade: deflected')
        expect(text.split('\n').slice(-3)).toEqual(['Goalscorers', 'DJ: 2 (1 pen)', 'Own goals: Ade 1'])
    })
})

describe('highlightsDescription with a teaser', () => {
    const starred = events.map((e) => (e.id === 'a' ? { ...e, marks: ['teaser' as const] } : e))
    const args = { ...base, events: starred, durationsSec: [600, 600], teaser: true }

    it('should start with 00:00 Coming up, then the first event after the teaser and the card', () => {
        const lines = highlightsDescription({ ...args, introSec: 7, reencoded: true }).split('\n')
        // The teaser is the goal's own window (before + after = 14 s), then the 7 s card.
        expect(lines.slice(2, 6)).toEqual(['00:00 Coming up', '00:21 Goal 1-0 (Whites) Sam', '00:35 Highlight Jo: nutmeg', '00:49 Goal 1-1 (Colours) Priya'])
    })
    it('should use the real timeline, which counts the teaser cuts', () => {
        // 1 teaser cut + 4 reel cuts; the render measured the reel starting at 30 s (card included).
        const timeline = [0, 30, 44, 58, 72].map((s, i) => ({ outStartSec: s, sourceStartSec: [190, 190, 390, 20, 490][i], outDurationSec: 14 }))
        const lines = highlightsDescription({ ...args, introSec: 7, reencoded: true, timeline }).split('\n')
        expect(lines.slice(2, 4)).toEqual(['00:00 Coming up', '00:30 Goal 1-0 (Whites) Sam'])
    })
    it('should count a moment\'s own seconds and teaser replay before the card', () => {
        const ed = events.map((e) => (e.id === 'a' ? { ...e, marks: ['teaser' as const], teaser: { beforeSec: 2, afterSec: 3, replay: true } } : e))
        const replay = { beforeSec: 4, afterSec: 1, speed: 0.5 }
        const lines = highlightsDescription({ ...args, events: ed, replay, introSec: 7, reencoded: true }).split('\n')
        // Teaser: 5 s clip + 5 s replay window at 0.5x (10 s), then the 7 s card: the reel starts at 22 s.
        expect(lines.slice(2, 4)).toEqual(['00:00 Coming up', '00:22 Goal 1-0 (Whites) Sam'])
    })
    it('should be unchanged without the teaser', () => {
        expect(highlightsDescription({ ...args, teaser: false, introSec: 4 })).toBe(highlightsDescription({ ...base, introSec: 4 }))
        expect(highlightsDescription({ ...base, events: starred, introSec: 4 })).toBe(highlightsDescription({ ...base, introSec: 4 }))
    })
})
