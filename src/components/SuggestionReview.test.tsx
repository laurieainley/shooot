// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppState } from '../state'

vi.mock('../detectJobs', () => ({
    useDetectJob: (sel: (s: { phase: string; fraction: number; error: string | null; scores: null }) => unknown) => sel({ phase: 'done', fraction: 1, error: null, scores: null }),
    startDetection: vi.fn(), cancelDetection: vi.fn(), getDetectJob: () => ({ phase: 'done' }),
}))
import { SuggestionReview } from './SuggestionReview'

const run = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 2 }
beforeEach(() => {
    useAppState.setState({
        files: [{ id: 'f', name: 'A.MP4', url: '', kind: 'full', durationSec: 600, file: new File([], 'A.MP4') }] as never,
        cumulativeOffsets: [0], events: [], suggestions: [], suggestionRun: null, reviewIndex: 0, panel: 'review',
        teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }],
    })
    useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
})

describe('SuggestionReview', () => {
    it('should show the first suggestion with a Beta tag', () => {
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByText('Beta')).toBeTruthy()
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
    })
    it('should keep a goal for the chosen team with G then 2, and move on', () => {
        render(<SuggestionReview onClose={() => {}} />)
        act(() => { fireEvent.keyDown(window, { key: 'g' }) })
        expect(screen.getByRole('button', { name: /Colours/ })).toBeTruthy()
        act(() => { fireEvent.keyDown(window, { key: '2' }) })
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Colours' })
        expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
    })
    it('should reject with X and show the summary at the end', () => {
        render(<SuggestionReview onClose={() => {}} />)
        act(() => { fireEvent.keyDown(window, { key: 'x' }) })
        act(() => { fireEvent.keyDown(window, { key: 's' }) })
        expect(screen.getByText('You kept 1 of 2.')).toBeTruthy()
    })
    it('should warn when very few were kept', () => {
        useAppState.getState().setSuggestions(run, Array.from({ length: 10 }, (_, i) => ({ timeSec: 30 + i * 40, score: 1 })))
        render(<SuggestionReview onClose={() => {}} />)
        for (let i = 0; i < 10; i++) act(() => { fireEvent.keyDown(window, { key: 'x' }) })
        expect(screen.getByText('Detection struggled on this footage. Copy diagnostics and send it over.')).toBeTruthy()
    })
    it('should say nothing stood out when there are no suggestions', () => {
        useAppState.setState({ suggestions: [], suggestionRun: { ...run, total: 0 } })
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByText('Nothing stood out in the audio. Tag goals as you watch.')).toBeTruthy()
        expect(screen.queryByText(/You kept 0 of 0/)).toBeNull()
    })
    it('should offer touch buttons of at least the goal action', () => {
        render(<SuggestionReview onClose={() => {}} />)
        fireEvent.click(screen.getByRole('button', { name: /^Goal/ }))
        fireEvent.click(screen.getByRole('button', { name: /Whites/ }))
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Whites' })
    })
})
