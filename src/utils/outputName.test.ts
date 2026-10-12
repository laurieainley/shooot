import { describe, it, expect } from 'vitest'
import { outputFileName } from './outputName'
import type { MatchEvent, Team } from '../types'

const teams: Team[] = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: 'multi', roster: [] }]
const goal = (id: string, team: string): MatchEvent => ({ id, matchTimeSec: 10, sourceFileIndex: 0, type: 'goal', team })
const events = [goal('a', 'Colours'), goal('b', 'Whites'), goal('c', 'Colours')]
const name = (o: Partial<Parameters<typeof outputFileName>[0]> = {}) =>
    outputFileName({ kind: 'highlights', preview: false, title: 'Matchday 3', teams, events, ...o })

describe('outputFileName', () => {
    it('should name the reel by title and final score in team order', () => {
        expect(name()).toBe('Matchday 3 - Whites 1-2 Colours.mp4')
    })
    it('should mark the full match and previews', () => {
        expect(name({ kind: 'fullMatch' })).toBe('Matchday 3 - Whites 1-2 Colours (full match).mp4')
        expect(name({ preview: true })).toBe('Matchday 3 - Whites 1-2 Colours (preview).mp4')
        expect(name({ kind: 'fullMatch', preview: true })).toBe('Matchday 3 - Whites 1-2 Colours (full match, preview).mp4')
    })
    it('should shorten a long title at a word, and drop characters files cannot hold', () => {
        expect(name({ title: 'The Sunday League Cup Final: second leg replay' })).toBe('The Sunday League Cup… - Whites 1-2 Colours.mp4')
        expect(name({ title: 'A/B "derby"' })).toBe('A B derby - Whites 1-2 Colours.mp4')
    })
    it('should fall back without a title or teams', () => {
        expect(name({ title: null })).toBe('Whites 1-2 Colours.mp4')
        expect(name({ title: '', teams: [] })).toBe('Highlights.mp4')
        expect(name({ title: '', teams: [], kind: 'fullMatch' })).toBe('Full match.mp4')
        expect(name({ title: 'Matchday 3', teams: [] })).toBe('Matchday 3.mp4')
    })
})

describe('outputFileName clips', () => {
    const clip = (o: Partial<Parameters<typeof outputFileName>[0]>) => outputFileName({ kind: 'clip', preview: false, title: 'Matchday 3', teams, events, ...o })
    it('should add the minute, label and person after the title and score', () => {
        expect(clip({ clip: { minute: 13, label: 'Goal', person: 'DJ' } })).toBe("Matchday 3 - Whites 1-2 Colours - 13' Goal DJ.mp4")
    })
    it('should fall back to Clip without a title or teams, and skip a missing minute or person', () => {
        expect(clip({ title: null, teams: [], events: [], clip: { minute: null, label: 'Save' } })).toBe('Clip - Save.mp4')
    })
    it('should tag preview clips and clean unsafe characters in the person', () => {
        expect(clip({ preview: true, title: null, teams: [], events: [], clip: { minute: 5, label: 'Goal (pen)', person: 'A/B' } })).toBe("Clip - 5' Goal (pen) A B (preview).mp4")
    })
})
