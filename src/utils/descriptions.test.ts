import { describe, it, expect } from 'vitest'
import { fullMatchDescription, highlightsDescription } from './descriptions'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }]
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
            'Priya 1',
            'Sam 1',
        ])
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
            'Priya 1',
            'Sam 1',
        ])
    })

    it('should add the title card length to every chapter after kick-off', () => {
        const lines = fullMatchDescription({ ...base, introSec: 4 }).split('\n')
        expect(lines[2]).toBe('00:00 Kick off')
        expect(lines[3]).toBe('02:14 Goal 1-0 (Whites) Sam')
    })
})
