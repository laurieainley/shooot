// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppState } from '../state'

const startDetectionMock = vi.hoisted(() => vi.fn())
const job = vi.hoisted(() => ({ phase: 'done', fraction: 1, error: null as string | null }))
vi.mock('../detectJobs', () => ({
    useDetectJob: (sel: (s: { phase: string; fraction: number; error: string | null; scores: null }) => unknown) => sel({ phase: job.phase, fraction: job.fraction, error: job.error, scores: null }),
    startDetection: (...a: unknown[]) => startDetectionMock(...a), cancelDetection: vi.fn(), getDetectJob: () => ({ phase: 'done' }),
}))
import { SuggestionReview } from './SuggestionReview'
import { openFindGoals } from './findGoals'
import { registerPlayerStep, registerPlayerToggle, setPlayerPaused } from './playerControl'

const run = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 2 }
beforeEach(() => {
    setPlayerPaused(true)
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
        const unregister = registerPlayerToggle(toggle)
        render(<SuggestionReview onClose={() => {}} />)
        act(() => { fireEvent.keyDown(window, { key: ' ' }) })
        expect(toggle).toHaveBeenCalledTimes(1)
        unregister()
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
    describe('review window', () => {
        const seekSpy = (): ReturnType<typeof vi.fn> => { const f = vi.fn(); useAppState.setState({ seekToGoal: f }); return f }
        it('should default to 5 s before and 2 s after', () => {
            render(<SuggestionReview onClose={() => {}} />)
            expect(screen.getByText('−5 s … +2 s')).toBeTruthy()
        })
        it('should extend the start with [ (seeking to the new start) and the end with ]', () => {
            const seek = seekSpy()
            render(<SuggestionReview onClose={() => {}} />)
            seek.mockClear()
            act(() => { fireEvent.keyDown(window, { key: '[' }) })
            act(() => { fireEvent.keyDown(window, { key: '[' }) })
            expect(screen.getByText('−9 s … +2 s')).toBeTruthy()
            expect(seek).toHaveBeenLastCalledWith(0, 91)
            seek.mockClear()
            act(() => { fireEvent.keyDown(window, { key: ']' }) })
            expect(screen.getByText('−9 s … +4 s')).toBeTruthy()
            expect(seek).not.toHaveBeenCalled()
        })
        it('should reset to the default for the next suggestion', () => {
            render(<SuggestionReview onClose={() => {}} />)
            act(() => { fireEvent.keyDown(window, { key: '[' }) })
            act(() => { fireEvent.keyDown(window, { key: ']' }) })
            act(() => { fireEvent.keyDown(window, { key: 'ArrowRight' }) })
            expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
            expect(screen.getByText('−5 s … +2 s')).toBeTruthy()
        })
        it('should not start before 0 or end after the last file', () => {
            useAppState.getState().setSuggestions(run, [{ timeSec: 7, score: 5 }, { timeSec: 598, score: 4 }])
            render(<SuggestionReview onClose={() => {}} />)
            for (let i = 0; i < 3; i++) act(() => { fireEvent.keyDown(window, { key: '[' }) })
            expect(screen.getByText('−7 s … +2 s')).toBeTruthy()
            act(() => { fireEvent.keyDown(window, { key: 'ArrowRight' }) })
            for (let i = 0; i < 3; i++) act(() => { fireEvent.keyDown(window, { key: ']' }) })
            expect(screen.getByText('−5 s … +2 s')).toBeTruthy() // 598 + 2 = 600 is already the end
        })
        it('should have 44 px buttons with labels, and ignore the keys with modifiers or repeat', () => {
            render(<SuggestionReview onClose={() => {}} />)
            expect(screen.getByRole('button', { name: 'Start 2 seconds earlier' }).className).toContain('review__btn')
            expect(screen.getByRole('button', { name: 'End 2 seconds later' }).className).toContain('review__btn')
            act(() => { fireEvent.keyDown(window, { key: '[', metaKey: true }) })
            act(() => { fireEvent.keyDown(window, { key: ']', ctrlKey: true }) })
            act(() => { fireEvent.keyDown(window, { key: '[', repeat: true }) })
            expect(screen.getByText('−5 s … +2 s')).toBeTruthy()
            fireEvent.click(screen.getByRole('button', { name: 'Start 2 seconds earlier' }))
            expect(screen.getByText('−7 s … +2 s')).toBeTruthy()
        })
    })
    describe('goal time', () => {
        it('should show the estimate while playing and the playhead while paused', () => {
            setPlayerPaused(false)
            render(<SuggestionReview onClose={() => {}} />)
            expect(screen.getByText(/estimate/)).toBeTruthy()
            expect(screen.getByText('01:38.0')).toBeTruthy() // 100 s − 2 s
            act(() => { useAppState.setState({ currentTimeInFileSec: 97.34 }) })
            act(() => { setPlayerPaused(true) }) // the user paused after it was playing
            expect(screen.getByText(/at playhead/)).toBeTruthy()
            expect(screen.getByText('01:37.3')).toBeTruthy()
        })
        it('should keep at the estimate while playing', () => {
            setPlayerPaused(false)
            render(<SuggestionReview onClose={() => {}} />)
            act(() => { fireEvent.keyDown(window, { key: 'h' }) })
            expect(useAppState.getState().events[0]).toMatchObject({ type: 'highlight', matchTimeSec: 98, sourceFileIndex: 0 })
        })
        it('should keep at the playhead (file and time) while paused, on a two-file timeline', () => {
            useAppState.setState({
                files: [{ id: 'f', name: 'A.MP4', url: '', kind: 'full', durationSec: 600, file: new File([], 'A.MP4') }, { id: 'g', name: 'B.MP4', url: '', kind: 'full', durationSec: 600, file: new File([], 'B.MP4') }] as never,
                cumulativeOffsets: [0, 600], currentFileIndex: 1, currentTimeInFileSec: 12.34,
            })
            useAppState.getState().setSuggestions(run, [{ timeSec: 610, score: 5 }])
            render(<SuggestionReview onClose={() => {}} />)
            const un = registerPlayerStep(vi.fn())
            act(() => { fireEvent.keyDown(window, { key: 'ArrowUp' }) }) // user steps a frame
            un()
            act(() => { fireEvent.keyDown(window, { key: 's' }) })
            expect(useAppState.getState().events[0]).toMatchObject({ type: 'save', sourceFileIndex: 1, matchTimeSec: 12.3 })
        })
        it('should keep the estimate when merely paused after a seek (user has not adjusted)', () => {
            render(<SuggestionReview onClose={() => {}} />)
            expect(screen.getByText(/estimate/)).toBeTruthy()
            useAppState.setState({ currentTimeInFileSec: 50 })
            act(() => { fireEvent.keyDown(window, { key: 'h' }) })
            expect(useAppState.getState().events[0]).toMatchObject({ matchTimeSec: 98 })
        })
        it('should use the playhead after Space-pausing', () => {
            setPlayerPaused(false)
            const un = registerPlayerToggle(() => setPlayerPaused(true))
            render(<SuggestionReview onClose={() => {}} />)
            act(() => { fireEvent.keyDown(window, { key: ' ' }) })
            useAppState.setState({ currentTimeInFileSec: 50.4 })
            act(() => { fireEvent.keyDown(window, { key: 'h' }) })
            un()
            expect(useAppState.getState().events[0]).toMatchObject({ matchTimeSec: 50.4 })
        })
        it('should ignore Shift with decision and window keys', () => {
            render(<SuggestionReview onClose={() => {}} />)
            for (const key of ['g', 'o', 's', 'h', 'x', '[', ']']) act(() => { fireEvent.keyDown(window, { key, shiftKey: true }) })
            expect(useAppState.getState().events).toHaveLength(0)
            expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
            expect(screen.getByText('−5 s … +2 s')).toBeTruthy()
        })
        it('should still extend the end when the total duration is unknown', () => {
            useAppState.setState({ files: [{ id: 'f', name: 'A.MP4', url: '', kind: 'full', file: new File([], 'A.MP4') }] as never })
            render(<SuggestionReview onClose={() => {}} />)
            act(() => { fireEvent.keyDown(window, { key: ']' }) })
            expect(screen.getByText('−5 s … +4 s')).toBeTruthy()
        })
        it('should not loop while paused, and loop again when playing', () => {
            const seek = vi.fn()
            useAppState.setState({ seekToGoal: seek })
            setPlayerPaused(false)
            render(<SuggestionReview onClose={() => {}} />)
            act(() => { useAppState.setState({ currentTimeInFileSec: 96 }) }) // landed after the start seek
            seek.mockClear()
            act(() => { setPlayerPaused(true) })
            act(() => { useAppState.setState({ currentTimeInFileSec: 102.5 }) })
            expect(seek).not.toHaveBeenCalled()
            act(() => { setPlayerPaused(false) })
            act(() => { useAppState.setState({ currentTimeInFileSec: 102.6 }) })
            expect(seek).toHaveBeenCalledTimes(1)
        })
        it('should step frames with the arrows and seconds with Shift, and from the buttons', () => {
            const step = vi.fn()
            const un = registerPlayerStep(step)
            render(<SuggestionReview onClose={() => {}} />)
            act(() => { fireEvent.keyDown(window, { key: 'ArrowUp' }) })
            act(() => { fireEvent.keyDown(window, { key: 'ArrowDown', repeat: true }) })
            act(() => { fireEvent.keyDown(window, { key: 'ArrowUp', shiftKey: true }) })
            act(() => { fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true }) })
            act(() => { fireEvent.keyDown(window, { key: 'ArrowUp', metaKey: true }) })
            expect(step.mock.calls).toEqual([['frame', 1], ['frame', -1], ['second', 1], ['second', -1]])
            expect(screen.getByRole('button', { name: 'Back one frame' }).className).toContain('review__btn')
            fireEvent.click(screen.getByRole('button', { name: 'Forward one frame' }))
            expect(step).toHaveBeenLastCalledWith('frame', 1)
            un()
        })
        it('should hide the frame buttons while playing', () => {
            setPlayerPaused(false)
            render(<SuggestionReview onClose={() => {}} />)
            expect(screen.queryByRole('button', { name: 'Back one frame' })).toBeNull()
        })
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
    describe('videos changed', () => {
        const stale = (): void => {
            useAppState.getState().decideSuggestion(useAppState.getState().suggestions[0].id, { kind: 'reject' })
            useAppState.setState({ suggestionRun: { ...run, fileKeys: ['somethingelse'] } })
        }
        it('should ask before clearing old suggestions, then clear and start', () => {
            stale()
            startDetectionMock.mockClear()
            render(<SuggestionReview onClose={() => {}} />)
            fireEvent.click(screen.getByRole('button', { name: 'Find goals' }))
            expect(screen.getByRole('alertdialog', { name: 'Clear old suggestions' })).toHaveTextContent('Clear the old suggestions and look for goals in these videos?')
            expect(startDetectionMock).not.toHaveBeenCalled()
            fireEvent.click(screen.getByRole('button', { name: 'Clear and find goals' }))
            expect(useAppState.getState().suggestions).toEqual([])
            expect(startDetectionMock).toHaveBeenCalledTimes(1)
        })
        it('should change nothing on Cancel', () => {
            stale()
            startDetectionMock.mockClear()
            render(<SuggestionReview onClose={() => {}} />)
            fireEvent.click(screen.getByRole('button', { name: 'Find goals' }))
            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
            expect(screen.queryByRole('alertdialog')).toBeNull()
            expect(useAppState.getState().suggestions).toHaveLength(2)
            expect(startDetectionMock).not.toHaveBeenCalled()
        })
        it('should replace, not merge, a run on different videos', () => {
            stale()
            useAppState.getState().setSuggestions({ ...run, fileKeys: ['new'] }, [{ timeSec: 100, score: 3 }])
            const s = useAppState.getState().suggestions
            expect(s).toHaveLength(1)
            expect(s[0].status).toBe('pending')
        })
        it('should still merge decisions when the videos are the same, and open at the first pending one', () => {
            useAppState.setState({ suggestionRun: { ...run, fileKeys: ['A.MP4'] } })
            useAppState.getState().decideSuggestion(useAppState.getState().suggestions[0].id, { kind: 'reject' })
            useAppState.getState().setSuggestions({ ...run, fileKeys: ['A.MP4'] }, [{ timeSec: 400, score: 3 }])
            const st = useAppState.getState()
            expect(st.suggestions.map((x) => x.status)).toEqual(['rejected', 'pending'])
            expect(st.reviewIndex).toBe(1)
        })
    })
})
