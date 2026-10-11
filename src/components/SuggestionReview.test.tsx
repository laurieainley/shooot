// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppState } from '../state'

const startDetectionMock = vi.hoisted(() => vi.fn())
const job = vi.hoisted(() => ({ phase: 'done', fraction: 1, error: null as string | null, ballPhase: 'idle', ballFraction: 0, ballError: null as string | null, ballEp: null as string | null }))
vi.mock('../detectJobs', () => ({
    useDetectJob: (sel: (s: Record<string, unknown>) => unknown) => sel({ ...job, scores: null }),
    startDetection: (...a: unknown[]) => startDetectionMock(...a), cancelDetection: vi.fn(), getDetectJob: () => ({ phase: 'done' }),
}))
import { SuggestionReview } from './SuggestionReview'
import { openFindGoals } from './findGoals'
import { isPlayerPaused, registerPlayerSeekPaused, registerPlayerStep, registerPlayerToggle, setPlayerPaused } from './playerControl'

const press = (key: string, opts: KeyboardEventInit = {}): void => { act(() => { fireEvent.keyDown(window, { key, ...opts }) }) }
const run = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 2 }
beforeEach(() => {
    setPlayerPaused(true)
    job.phase = 'done'; job.fraction = 1; job.error = null; job.ballPhase = 'idle'; job.ballFraction = 0; job.ballError = null; job.ballEp = null
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
        press('g')
        expect(screen.getByRole('button', { name: /Colours/ })).toBeTruthy()
        press('2')
        expect(useAppState.getState().events).toHaveLength(0) // selecting never saves
        press('Enter')
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Colours' })
        expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
    })
    it('should reject with X and show the summary at the end', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('x'); press('Enter')
        press('s'); press('Enter')
        expect(screen.getByText('You kept 1 of 2.')).toBeTruthy()
    })
    it('should warn when very few were kept', () => {
        useAppState.getState().setSuggestions(run, Array.from({ length: 10 }, (_, i) => ({ timeSec: 30 + i * 40, score: 1 })))
        render(<SuggestionReview onClose={() => {}} />)
        for (let i = 0; i < 10; i++) { press('x'); press('Enter') }
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
        fireEvent.click(screen.getByRole('button', { name: 'Use the estimate instead' }))
        expect(screen.getByRole('button', { name: /^Goal/ }).className).toContain('rv__choice')
        fireEvent.click(screen.getByRole('button', { name: /^Goal/ }))
        fireEvent.click(screen.getByRole('button', { name: /Whites/ }))
        expect(useAppState.getState().events).toHaveLength(0)
        fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Whites' })
    })
    it('should decide only once for a repeated keydown', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('x'); press('Enter')
        press('x', { repeat: true }); press('Enter', { repeat: true })
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
        press('g'); press('Enter')
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Whites' })
    })
    it('should confirm the pre-selected team with Enter', async () => {
        const { SuggestionCard } = await import('./SuggestionCard')
        render(<SuggestionCard suggestion={useAppState.getState().suggestions[0]} index={0} total={2} onNext={() => {}} onPrev={() => {}} preselectTeam="Colours" />)
        press('o'); press('Enter')
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
            expect(screen.getByRole('button', { name: 'Start 2 seconds earlier' })).toBeTruthy()
            expect(screen.getByRole('button', { name: 'End 2 seconds later' })).toBeTruthy()
            act(() => { fireEvent.keyDown(window, { key: '[', metaKey: true }) })
            act(() => { fireEvent.keyDown(window, { key: ']', ctrlKey: true }) })
            act(() => { fireEvent.keyDown(window, { key: '[', repeat: true }) })
            expect(screen.getByText('−5 s … +2 s')).toBeTruthy()
            fireEvent.click(screen.getByRole('button', { name: 'Start 2 seconds earlier' }))
            expect(screen.getByText('−7 s … +2 s')).toBeTruthy()
        })
    })
    describe('marking the moment', () => {
        const at = (sec: number): void => { act(() => { useAppState.setState({ currentTimeInFileSec: sec }) }) }
        it('should tell the user to pause and mark before marking, and show the estimate ring only', () => {
            render(<SuggestionReview onClose={() => {}} />)
            expect(screen.getByText('Pause when the ball crosses the line or the moment happens, then press M (or tap Mark moment)')).toBeTruthy()
            expect(screen.getByTestId('rtl-estimate')).toBeTruthy()
            expect(screen.queryByTestId('rtl-marked')).toBeNull()
        })
        it('should mark at the playhead with M, show the pin and ask what it was', () => {
            at(97.34)
            render(<SuggestionReview onClose={() => {}} />)
            press('m')
            expect(screen.getByText('Marked at 01:37.3 — now choose what it was')).toBeTruthy()
            expect(screen.getByTestId('rtl-marked')).toBeTruthy()
        })
        it('should pause a playing player when marking, and re-mark with M', () => {
            setPlayerPaused(false)
            const un = registerPlayerToggle(() => setPlayerPaused(true))
            at(96)
            render(<SuggestionReview onClose={() => {}} />)
            press('m')
            expect(isPlayerPaused()).toBe(true)
            at(97)
            press('m')
            at(99.9) // paused after marking: the playhead only moves if the user steps
            press('h'); press('Enter')
            un()
            expect(useAppState.getState().events[0].matchTimeSec).toBeCloseTo(99.9, 1)
        })
        it('should mark from the Mark moment button', () => {
            at(50.4)
            render(<SuggestionReview onClose={() => {}} />)
            fireEvent.click(screen.getByRole('button', { name: /Mark moment/ }))
            expect(screen.getByText(/^Marked at 00:50\.4/)).toBeTruthy()
        })
        it('should select H without saving or advancing, and save on Enter with the marked time', () => {
            at(97.34)
            render(<SuggestionReview onClose={() => {}} />)
            press('m'); press('h')
            expect(useAppState.getState().events).toHaveLength(0)
            expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
            expect(screen.getByText('Highlight at 01:37.3 — press Enter to save')).toBeTruthy()
            press('Enter')
            expect(useAppState.getState().events[0]).toMatchObject({ type: 'highlight', matchTimeSec: 97.3, sourceFileIndex: 0 })
            expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
        })
        it('should name the goal in the instruction once a team is chosen', () => {
            at(97.34)
            render(<SuggestionReview onClose={() => {}} />)
            press('m'); press('g')
            expect(screen.getByText('Goal · Whites at 01:37.3 — press Enter to save')).toBeTruthy()
            press('2')
            expect(screen.getByText('Goal · Colours at 01:37.3 — press Enter to save')).toBeTruthy()
        })
        it('should save at the estimate, with a warning and the Save event at estimate label, when never marked', () => {
            render(<SuggestionReview onClose={() => {}} />)
            press('h')
            expect(screen.getByText('Using the estimate — mark the exact moment for accurate clips')).toBeTruthy()
            expect(screen.getByRole('button', { name: /^Save event at estimate/ })).toBeTruthy()
            press('Enter')
            expect(useAppState.getState().events[0]).toMatchObject({ type: 'highlight', matchTimeSec: 98 })
        })
        it('should not count the brief pause after a seek as a mark', () => {
            render(<SuggestionReview onClose={() => {}} />)
            at(50)
            expect(screen.queryByTestId('rtl-marked')).toBeNull()
            press('h'); press('Enter')
            expect(useAppState.getState().events[0]).toMatchObject({ matchTimeSec: 98 })
        })
        it('should count pausing after playing as a mark', () => {
            setPlayerPaused(false)
            render(<SuggestionReview onClose={() => {}} />)
            at(97.34)
            act(() => { setPlayerPaused(true) })
            expect(screen.getByTestId('rtl-marked')).toBeTruthy()
            press('h'); press('Enter')
            expect(useAppState.getState().events[0]).toMatchObject({ matchTimeSec: 97.3 })
        })
        it('should count stepping a frame as a mark, on a two-file timeline', () => {
            useAppState.setState({
                files: [{ id: 'f', name: 'A.MP4', url: '', kind: 'full', durationSec: 600, file: new File([], 'A.MP4') }, { id: 'g', name: 'B.MP4', url: '', kind: 'full', durationSec: 600, file: new File([], 'B.MP4') }] as never,
                cumulativeOffsets: [0, 600], currentFileIndex: 1, currentTimeInFileSec: 12.34,
            })
            useAppState.getState().setSuggestions(run, [{ timeSec: 610, score: 5 }])
            render(<SuggestionReview onClose={() => {}} />)
            const un = registerPlayerStep(vi.fn())
            press('ArrowUp')
            un()
            press('s'); press('Enter')
            expect(useAppState.getState().events[0]).toMatchObject({ type: 'save', sourceFileIndex: 1, matchTimeSec: 12.3 })
        })
        it('should keep the mark once playback resumes', () => {
            at(97.34)
            render(<SuggestionReview onClose={() => {}} />)
            press('m')
            act(() => { setPlayerPaused(false) })
            at(101)
            press('h'); press('Enter')
            expect(useAppState.getState().events[0]).toMatchObject({ matchTimeSec: 97.3 })
        })
        it('should need Enter for Not a goal too, and clear a choice with Esc or Backspace', () => {
            render(<SuggestionReview onClose={() => {}} />)
            press('x')
            expect(screen.getByRole('button', { name: /^Reject/ })).toBeTruthy()
            expect(useAppState.getState().suggestions[0].status).toBe('pending')
            press('Escape')
            expect(screen.queryByRole('button', { name: /^Reject/ })).toBeNull()
            press('g'); press('Backspace')
            expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
            expect(useAppState.getState().events).toHaveLength(0)
            press('x'); press('Enter')
            expect(useAppState.getState().suggestions[0].status).toBe('rejected')
        })
        it('should pre-select the given team and show the hint slot', async () => {
            const { SuggestionCard } = await import('./SuggestionCard')
            render(<SuggestionCard suggestion={useAppState.getState().suggestions[0]} index={0} total={2} onNext={() => {}} onPrev={() => {}} preselectTeam="Colours" hint="Ball in Colours' goal" />)
            expect(screen.getByText("Ball in Colours' goal")).toBeTruthy()
            press('g')
            expect(screen.getByRole('button', { name: /Colours/ })).toHaveAttribute('aria-pressed', 'true')
        })
        describe('Labs ball check', () => {
            it('should show the hint, and Enter after marking saves a Goal for the scoring team', () => {
                useAppState.setState({ suggestions: useAppState.getState().suggestions.map((s, i) => (i === 0 ? { ...s, ball: { goal: 'team1' as const, frames: 3 } } : s)) })
                render(<SuggestionReview onClose={() => {}} />)
                expect(screen.getByText("Ball in Whites' goal")).toBeTruthy()
                press('m')
                expect(screen.getByRole('button', { name: /Colours/ })).toHaveAttribute('aria-pressed', 'true')
                press('Enter')
                expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Colours' })
            })
            it('should swap the scoring team after half time', () => {
                useAppState.setState({
                    events: [{ id: 'ht', type: 'half_time', matchTimeSec: 50, sourceFileIndex: 0 }] as never,
                    suggestions: useAppState.getState().suggestions.map((s, i) => (i === 0 ? { ...s, ball: { goal: 'team1' as const, frames: 2 } } : s)),
                })
                render(<SuggestionReview onClose={() => {}} />)
                expect(screen.getByText("Ball in Colours' goal")).toBeTruthy() // ends swapped: team1's goal is now Colours'
                press('m')
                expect(screen.getByRole('button', { name: /Whites/ })).toHaveAttribute('aria-pressed', 'true')
            })
            it('should show no hint and no preselection without a ball tag', () => {
                render(<SuggestionReview onClose={() => {}} />)
                expect(screen.queryByText(/Ball in/)).toBeNull()
                press('m')
                expect(screen.getByRole('button', { name: /^Goal/ })).toHaveAttribute('aria-pressed', 'false')
                press('Enter')
                expect(useAppState.getState().events).toHaveLength(0)
            })
            it('should still let the user choose something else', () => {
                useAppState.setState({ suggestions: useAppState.getState().suggestions.map((s, i) => (i === 0 ? { ...s, ball: { goal: 'team1' as const, frames: 3 } } : s)) })
                render(<SuggestionReview onClose={() => {}} />)
                press('m'); press('s'); press('Enter')
                expect(useAppState.getState().events[0]).toMatchObject({ type: 'save' })
            })
            it('should say the model is loading until the detector is ready, and flag the slow wasm fallback', () => {
                job.ballPhase = 'running'; job.ballFraction = 0; job.ballEp = null
                const { rerender } = render(<SuggestionReview onClose={() => {}} />)
                expect(screen.getByText('Loading the ball model…')).toBeTruthy()
                job.ballEp = 'wasm'; job.ballFraction = 0.4
                rerender(<SuggestionReview onClose={() => {}} />)
                expect(screen.getByText('Checking the goal mouths… 40% (slow on this device)')).toBeTruthy()
            })
            it('should show the phase 2 progress line while the review stays usable', () => {
                job.ballPhase = 'running'; job.ballFraction = 0.4; job.ballEp = 'webgpu'
                render(<SuggestionReview onClose={() => {}} />)
                expect(screen.getByText('Checking the goal mouths… 40%')).toBeTruthy()
                expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
            })
            it('should show a plain error line without blocking the review', () => {
                job.ballPhase = 'failed'; job.ballError = 'Ball check unavailable: model not found.'
                render(<SuggestionReview onClose={() => {}} />)
                expect(screen.getByText('Ball check unavailable: model not found.')).toBeTruthy()
                expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
            })
            it('should add "Ball seen in N." to the summary', () => {
                useAppState.setState({ reviewIndex: 2, suggestions: useAppState.getState().suggestions.map((s) => ({ ...s, ball: { goal: 'team2' as const, frames: 2 } })) })
                render(<SuggestionReview onClose={() => {}} />)
                expect(screen.getByText('Ball seen in 2.')).toBeTruthy()
            })
        })
        it('should scrub from the timeline without marking, pausing at that time', () => {
            const seek = vi.fn()
            const un = registerPlayerSeekPaused(seek)
            render(<SuggestionReview onClose={() => {}} />)
            const bar = screen.getByRole('slider')
            bar.getBoundingClientRect = () => ({ left: 0, width: 700, top: 0, height: 44, right: 700, bottom: 44, x: 0, y: 0, toJSON: () => ({}) })
            fireEvent.pointerDown(bar, { clientX: 350, pointerId: 1 })
            un()
            expect(seek).toHaveBeenCalledWith(0, 98.5) // window 95…102, halfway
            expect(screen.queryByTestId('rtl-marked')).toBeNull()
        })
        it('should ignore Shift with decision and window keys', () => {
            render(<SuggestionReview onClose={() => {}} />)
            for (const key of ['g', 'o', 's', 'h', 'x', '[', ']', 'm']) press(key, { shiftKey: true })
            expect(useAppState.getState().events).toHaveLength(0)
            expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
            expect(screen.getByText('−5 s … +2 s')).toBeTruthy()
        })
        it('should still extend the end when the total duration is unknown', () => {
            useAppState.setState({ files: [{ id: 'f', name: 'A.MP4', url: '', kind: 'full', file: new File([], 'A.MP4') }] as never })
            render(<SuggestionReview onClose={() => {}} />)
            press(']')
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
        it('should step frames with the arrows and seconds with Shift, and from the nudge buttons while paused', () => {
            const step = vi.fn()
            const un = registerPlayerStep(step)
            render(<SuggestionReview onClose={() => {}} />)
            press('ArrowUp'); press('ArrowDown', { repeat: true }); press('ArrowUp', { shiftKey: true }); press('ArrowDown', { shiftKey: true }); press('ArrowUp', { metaKey: true })
            expect(step.mock.calls).toEqual([['frame', 1], ['frame', -1], ['second', 1], ['second', -1]])
            fireEvent.click(screen.getByRole('button', { name: 'Forward one frame' }))
            expect(step).toHaveBeenLastCalledWith('frame', 1)
            un()
        })
        it('should disable the nudge buttons while playing', () => {
            setPlayerPaused(false)
            render(<SuggestionReview onClose={() => {}} />)
            expect(screen.getByRole('button', { name: 'Back one frame' })).toBeDisabled()
        })
        it('should keep one step at a time: no type buttons until marked or the estimate is accepted', () => {
            render(<SuggestionReview onClose={() => {}} />)
            expect(screen.queryByRole('group', { name: 'What was it?' })).toBeNull()
            fireEvent.click(screen.getByRole('button', { name: 'Use the estimate instead' }))
            expect(screen.getByRole('group', { name: 'What was it?' })).toBeTruthy()
            expect(screen.getByRole('button', { name: /Not a goal/ })).toBeTruthy()
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
