// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppState } from '../state'

const job = vi.hoisted(() => ({ phase: 'done', fraction: 1, error: null as string | null }))
vi.mock('../detectJobs', () => ({
    useDetectJob: (sel: (s: { phase: string; fraction: number; error: string | null; scores: null }) => unknown) => sel({ phase: job.phase, fraction: job.fraction, error: job.error, scores: null }),
    startDetection: vi.fn(), cancelDetection: vi.fn(), getDetectJob: () => ({ phase: 'done' }),
}))
import { SuggestionReview } from './SuggestionReview'
import { openFindGoals } from './findGoals'
import { registerPlayerToggle } from './playerControl'

const run = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 2 }
beforeEach(() => {
    job.phase = 'done'; job.fraction = 1; job.error = null
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
    it('should keep a goal from the touch buttons (44 px class) without the keyboard', () => {
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByRole('button', { name: /^Goal/ }).className).toContain('review__btn')
        fireEvent.click(screen.getByRole('button', { name: /^Goal/ }))
        fireEvent.click(screen.getByRole('button', { name: /Whites/ }))
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Whites' })
    })
    it('should decide only once for a repeated keydown', () => {
        render(<SuggestionReview onClose={() => {}} />)
        act(() => { fireEvent.keyDown(window, { key: 'x' }) })
        act(() => { fireEvent.keyDown(window, { key: 'x', repeat: true }) })
        expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
        expect(useAppState.getState().suggestions[1].status).toBe('pending')
    })
    it('should ignore G with a modifier and keys typed in a field', () => {
        render(<SuggestionReview onClose={() => {}} />)
        act(() => { fireEvent.keyDown(window, { key: 'g', metaKey: true }) })
        const input = document.createElement('input')
        document.body.appendChild(input)
        act(() => { fireEvent.keyDown(input, { key: 'g' }) })
        input.remove()
        expect(screen.queryByRole('group', { name: 'Which team scored?' })).toBeNull()
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
    })
    it('should offer to start again, not a summary, after a cancelled run with nothing found', () => {
        job.phase = 'cancelled'
        useAppState.setState({ suggestions: [], suggestionRun: null })
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByText('Find goals was cancelled.')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Find goals' })).toBeTruthy()
        expect(screen.queryByText(/Nothing stood out/)).toBeNull()
    })
    it('should just offer Find goals when idle with nothing found', () => {
        job.phase = 'idle'
        useAppState.setState({ suggestions: [], suggestionRun: null })
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByRole('button', { name: 'Find goals' })).toBeTruthy()
        expect(screen.queryByText(/cancelled/)).toBeNull()
    })

    it('should confirm the first team with Enter after G', () => {
        render(<SuggestionReview onClose={() => {}} />)
        act(() => { fireEvent.keyDown(window, { key: 'g' }) })
        act(() => { fireEvent.keyDown(window, { key: 'Enter' }) })
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Whites' })
    })
    it('should confirm the pre-selected team with Enter', async () => {
        const { SuggestionCard } = await import('./SuggestionCard')
        render(<SuggestionCard suggestion={useAppState.getState().suggestions[0]} index={0} total={2} onNext={() => {}} onPrev={() => {}} preselectTeam="Colours" />)
        act(() => { fireEvent.keyDown(window, { key: 'o' }) })
        act(() => { fireEvent.keyDown(window, { key: 'Enter' }) })
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'own_goal', team: 'Colours' })
    })
    it('should play or pause the player with Space', () => {
        const toggle = vi.fn()
        registerPlayerToggle(toggle)
        render(<SuggestionReview onClose={() => {}} />)
        act(() => { fireEvent.keyDown(window, { key: ' ' }) })
        expect(toggle).toHaveBeenCalledTimes(1)
        registerPlayerToggle(null)
    })
    it('should open at the first pending suggestion, or the summary when none is pending', () => {
        act(() => { useAppState.getState().decideSuggestion(useAppState.getState().suggestions[0].id, { kind: 'reject' }) })
        useAppState.setState({ reviewIndex: 0 })
        openFindGoals()
        expect(useAppState.getState().reviewIndex).toBe(1)
        act(() => { useAppState.getState().decideSuggestion(useAppState.getState().suggestions[1].id, { kind: 'reject' }) })
        openFindGoals()
        expect(useAppState.getState().reviewIndex).toBe(2)
    })
    it('should base the health check on decided suggestions and mention those not reviewed', () => {
        useAppState.getState().setSuggestions(run, Array.from({ length: 10 }, (_, i) => ({ timeSec: 30 + i * 40, score: 1 })))
        useAppState.setState({ reviewIndex: 10 })
        for (const s of useAppState.getState().suggestions.slice(0, 4)) useAppState.getState().decideSuggestion(s.id, { kind: 'reject' })
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByText('6 not reviewed.')).toBeTruthy()
        expect(screen.queryByText(/Detection struggled/)).toBeNull() // only 4 decided
    })
    it('should keep showing the suggestions, with the failure above, when a re-run fails', () => {
        job.phase = 'failed'; job.error = 'no decoder'
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByRole('alert')).toHaveTextContent("Couldn't read the audio: no decoder")
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
    })
    it('should offer to find goals again when the videos changed', () => {
        useAppState.setState({ suggestionRun: { ...run, fileKeys: ['somethingelse'] } })
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByText('The videos changed since the last Find goals.')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Find goals' })).toBeTruthy()
        expect(screen.queryByText(/Suggestion 1 of 2/)).toBeNull()
    })
    it('should show progress as a progressbar and announce only phase changes', () => {
        job.phase = 'running'; job.fraction = 0.4
        const { rerender } = render(<SuggestionReview onClose={() => {}} />)
        const bar = screen.getByRole('progressbar')
        expect(bar).toHaveAttribute('aria-valuenow', '40')
        expect(bar).toHaveAttribute('aria-valuemin', '0'); expect(bar).toHaveAttribute('aria-valuemax', '100')
        const live = document.querySelector('[aria-live="polite"]') as HTMLElement
        expect(live.textContent).toBe('Listening for goals.')
        job.fraction = 0.7
        rerender(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70')
        expect(live.textContent).toBe('Listening for goals.')
        expect(live.contains(screen.getByRole('progressbar'))).toBe(false)
    })
    describe('copy feedback', () => {
        const toSummary = (): void => { useAppState.setState({ suggestions: [], suggestionRun: { ...run, total: 0 } }) }
        afterEach(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }) })
        it('should say Copied. when the clipboard accepts the text', async () => {
            Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => {}) }, configurable: true })
            toSummary()
            render(<SuggestionReview onClose={() => {}} />)
            await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' })) })
            expect(screen.getByText('Copied.')).toBeTruthy()
        })
        it('should show the text to select by hand when copying fails', async () => {
            Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('denied') }) }, configurable: true })
            toSummary()
            render(<SuggestionReview onClose={() => {}} />)
            await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' })) })
            expect(screen.getByText("Couldn't copy — select and copy the text below.")).toBeTruthy()
            expect((screen.getByLabelText('Text to copy') as HTMLTextAreaElement).value).toContain('Find goals (Beta)')
        })
    })
})
