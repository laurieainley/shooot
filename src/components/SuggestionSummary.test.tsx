// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppState } from '../state'

vi.mock('../detectJobs', () => ({ getDetectJob: () => ({ phase: 'done', ballPhase: 'idle', scores: null }), startDetection: vi.fn(), cancelDetection: vi.fn() }))
import { SuggestionSummary } from './SuggestionSummary'

const run = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 2 }
const goal = (id: string, team: string, t: number) => ({ id, type: 'goal', team, matchTimeSec: t, sourceFileIndex: 0 })
const many = (n: number, team: string) => Array.from({ length: n }, (_, i) => goal(`${team}${i}`, team, 10 + i))

beforeEach(() => {
    useAppState.setState({
        files: [], cumulativeOffsets: [0], events: [], suggestions: [], suggestionRun: null, knownFinalScore: null,
        teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }],
    })
})
const withPending = (): void => useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])

describe('SuggestionSummary known final score', () => {
    it('should list the goals not found by team and point to the other moments while some are still pending', () => {
        withPending()
        useAppState.setState({ events: [...many(11, 'Whites'), ...many(8, 'Colours')] as never, knownFinalScore: [13, 9] })
        render(<SuggestionSummary onClose={() => {}} />)
        expect(screen.getByText(/3 goals not found \(Whites 2, Colours 1\)\./)).toBeTruthy()
        expect(screen.getByText(/Look through the other moments, or tag them while watching\./)).toBeTruthy()
    })
    it('should only say to tag them while watching when nothing is left to review', () => {
        useAppState.setState({ events: [...many(12, 'Whites'), ...many(9, 'Colours')] as never, knownFinalScore: [13, 9] })
        render(<SuggestionSummary onClose={() => {}} />)
        expect(screen.getByText(/1 goal not found \(Whites 1\)\./)).toBeTruthy()
        expect(screen.getByText(/Tag them while watching\./)).toBeTruthy()
        expect(screen.queryByText(/Look through/)).toBeNull()
    })
    it('should say all goals are tagged when the score matches', () => {
        useAppState.setState({ events: [...many(13, 'Whites'), ...many(9, 'Colours')] as never, knownFinalScore: [13, 9] })
        render(<SuggestionSummary onClose={() => {}} />)
        expect(screen.getByText('All goals tagged.')).toBeTruthy()
        expect(screen.queryByText(/not found/)).toBeNull()
    })
    it('should say which team is over the final score', () => {
        useAppState.setState({ events: [...many(14, 'Whites'), ...many(9, 'Colours')] as never, knownFinalScore: [13, 9] })
        render(<SuggestionSummary onClose={() => {}} />)
        expect(screen.getByText('1 more than the final score (Whites).')).toBeTruthy()
    })
    it('should add nothing without a known score', () => {
        withPending()
        useAppState.setState({ events: many(2, 'Whites') as never })
        render(<SuggestionSummary onClose={() => {}} />)
        expect(screen.queryByText(/not found|All goals tagged|more than the final/)).toBeNull()
    })
})
