// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppState } from '../state'
import { getReviewWindow } from './reviewWindowState'
import { dismissToast, toastStore } from '../toasts'

const startDetectionMock = vi.hoisted(() => vi.fn())
const job = vi.hoisted(() => ({ phase: 'done', fraction: 1, error: null as string | null, ballPhase: 'idle', ballFraction: 0, ballError: null as string | null, ballEp: null as string | null, ballMs: null as number | null, ballDetail: null as string | null }))
vi.mock('../detectJobs', () => ({
    useDetectJob: (sel: (s: Record<string, unknown>) => unknown) => sel({ ...job, scores: null }),
    startDetection: (...a: unknown[]) => startDetectionMock(...a), cancelDetection: vi.fn(), getDetectJob: () => ({ ...job, phase: 'done' }),
}))
import { SuggestionReview } from './SuggestionReview'
import { openFindGoals, setRangeStep } from './findGoals'
import { isPlayerPaused, registerPlayerShortcut, registerPlayerSeekPaused, registerPlayerStep, registerPlayerToggle, setPlayerPaused } from './playerControl'

const press = (key: string, opts: KeyboardEventInit = {}): void => { act(() => { fireEvent.keyDown(window, { key, ...opts }) }) }
const run = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 2 }
beforeEach(() => {
    setRangeStep(false)
    setPlayerPaused(true)
    job.phase = 'done'; job.fraction = 1; job.error = null; job.ballPhase = 'idle'; job.ballFraction = 0; job.ballError = null; job.ballEp = null; job.ballMs = null; job.ballDetail = null
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
        press('s'); press('1'); press('Enter')
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
        fireEvent.click(screen.getByRole('button', { name: /^Confirm/ }))
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

    it('should never pre-select a team: Confirm stays disabled until the reviewer picks one', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('g')
        expect(screen.getByRole('button', { name: /Whites/ })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByRole('button', { name: /Colours/ })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByRole('button', { name: /^Confirm/ })).toBeDisabled()
        expect(screen.getByText(/choose the team \(1 \/ 2\)/)).toBeTruthy()
        press('Enter')
        expect(useAppState.getState().events).toHaveLength(0)
        press('2'); press('Enter')
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Colours' })
    })
    it('should need a team for an own goal too, with 1 / 2', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('o'); press('Enter')
        expect(useAppState.getState().events).toHaveLength(0)
        press('1'); press('Enter')
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'own_goal', team: 'Whites' })
    })
    it('should play or pause the player with Space', () => {
        const toggle = vi.fn()
        const unregister = registerPlayerToggle(toggle)
        render(<SuggestionReview onClose={() => {}} />)
        act(() => { fireEvent.keyDown(window, { key: ' ' }) })
        expect(toggle).toHaveBeenCalledTimes(1)
        unregister()
    })
    it('should not activate a focused button with Space: it only plays or pauses', () => {
        const toggle = vi.fn()
        const unregister = registerPlayerToggle(toggle)
        render(<SuggestionReview onClose={() => {}} />)
        const skip = screen.getByRole('button', { name: /Next/ })
        skip.focus()
        const down = fireEvent.keyDown(skip, { key: ' ' })
        const up = fireEvent.keyUp(skip, { key: ' ' })
        expect(toggle).toHaveBeenCalledTimes(1)
        expect(down).toBe(false) // default prevented
        expect(up).toBe(false)
        unregister()
    })
    it('should step to a decided suggestion going forward, and save on to the next one still to review', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }, { timeSec: 500, score: 3 }])
        act(() => { useAppState.getState().decideSuggestion(useAppState.getState().suggestions[1].id, { kind: 'keep', type: 'save', atSec: 301.5 }) })
        render(<SuggestionReview onClose={() => {}} />)
        press(']')
        expect(screen.getByText(/Suggestion 2 of 3/)).toBeTruthy()
        press('[')
        press('x'); press('Enter')
        expect(screen.getByText(/Suggestion 3 of 3/)).toBeTruthy()
    })
    it('should show the saved moment and choice when coming back to a kept suggestion', () => {
        act(() => { useAppState.getState().decideSuggestion(useAppState.getState().suggestions[0].id, { kind: 'keep', type: 'goal', team: 'Colours', atSec: 101.5 }) })
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
        expect(screen.getByText('01:41.5', { selector: '.rv__momentat' })).toBeTruthy()
        expect(screen.getByText('marked', { selector: '.rv__chipnote' })).toBeTruthy()
        expect(screen.getByRole('button', { name: /^Mark again/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Change what it was' }).textContent).toMatch(/Goal · Colours/)
        expect(screen.getByRole('button', { name: /Next/ })).toBeTruthy()
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
        it('should default to 5 s before and 4 s after', () => {
            render(<SuggestionReview onClose={() => {}} />)
            expect(screen.getByText('−5 s … +4 s')).toBeTruthy()
        })
        const earlier = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Start 2 seconds earlier' })) }
        const later = (): void => { fireEvent.click(screen.getByRole('button', { name: 'End 2 seconds later' })) }
        it('should extend the start with the earlier button (seeking to the new start) and the end with the later button', () => {
            const seek = seekSpy()
            render(<SuggestionReview onClose={() => {}} />)
            seek.mockClear()
            earlier(); earlier()
            expect(screen.getByText('−9 s … +4 s')).toBeTruthy()
            expect(seek).toHaveBeenLastCalledWith(0, 91)
            seek.mockClear()
            later()
            expect(screen.getByText('−9 s … +6 s')).toBeTruthy()
            expect(seek).not.toHaveBeenCalled()
        })
        it('should reset to the default for the next suggestion', () => {
            render(<SuggestionReview onClose={() => {}} />)
            earlier(); later()
            act(() => { fireEvent.keyDown(window, { key: ']' }) })
            expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
            expect(screen.getByText('−5 s … +4 s')).toBeTruthy()
        })
        it('should not start before 0 or end after the last file', () => {
            useAppState.getState().setSuggestions(run, [{ timeSec: 7, score: 5 }, { timeSec: 598, score: 4 }])
            render(<SuggestionReview onClose={() => {}} />)
            earlier(); earlier(); earlier()
            expect(screen.getByText('−7 s … +4 s')).toBeTruthy()
            act(() => { fireEvent.keyDown(window, { key: ']' }) })
            later(); later(); later()
            expect(screen.getByText('−5 s … +2 s')).toBeTruthy() // 598 + 4 clamps at 600, so = 600 is already the end
        })
        it('should have 44 px buttons with labels', () => {
            render(<SuggestionReview onClose={() => {}} />)
            expect(screen.getByRole('button', { name: 'Start 2 seconds earlier' })).toBeTruthy()
            expect(screen.getByRole('button', { name: 'End 2 seconds later' })).toBeTruthy()
            earlier()
            expect(screen.getByText('−7 s … +4 s')).toBeTruthy()
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
            expect(screen.getByText('Highlight at 01:37.3 — press Enter to confirm')).toBeTruthy()
            press('Enter')
            expect(useAppState.getState().events[0]).toMatchObject({ type: 'highlight', matchTimeSec: 97.3, sourceFileIndex: 0 })
            expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
        })
        it('should name the goal in the instruction once a team is chosen', () => {
            at(97.34)
            render(<SuggestionReview onClose={() => {}} />)
            press('m'); press('g')
            expect(screen.getByText('Goal at 01:37.3 — choose the team (1 / 2)')).toBeTruthy()
            press('1')
            expect(screen.getByText('Goal · Whites at 01:37.3 — press Enter to confirm')).toBeTruthy()
            press('2')
            expect(screen.getByText('Goal · Colours at 01:37.3 — press Enter to confirm')).toBeTruthy()
        })
        it('should save at the estimate, with a warning and the Save event at estimate label, when never marked', () => {
            render(<SuggestionReview onClose={() => {}} />)
            press('h')
            expect(screen.getByText('Using the estimate — mark the exact moment for accurate clips')).toBeTruthy()
            expect(screen.getByRole('button', { name: /^Confirm at estimate/ })).toBeTruthy()
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
        it('should not mark when pausing after playing: Space only plays and pauses', () => {
            setPlayerPaused(false)
            render(<SuggestionReview onClose={() => {}} />)
            at(97.34)
            act(() => { setPlayerPaused(true) })
            expect(screen.queryByTestId('rtl-marked')).toBeNull()
            press('h'); press('Enter')
            expect(useAppState.getState().events[0]).toMatchObject({ matchTimeSec: 98 })
        })
        it('should toggle playback with Space without marking', () => {
            const toggle = vi.fn()
            const un = registerPlayerToggle(toggle)
            render(<SuggestionReview onClose={() => {}} />)
            press(' ')
            un()
            expect(toggle).toHaveBeenCalledTimes(1)
            expect(screen.queryByTestId('rtl-marked')).toBeNull()
        })
        it('should keep the Mark moment button on the card after marking, and re-mark in place', () => {
            at(50.4)
            render(<SuggestionReview onClose={() => {}} />)
            fireEvent.click(screen.getByRole('button', { name: /^Mark moment/ }))
            expect(screen.getByText('marked', { selector: '.rv__chipnote' })).toBeTruthy()
            expect(screen.getByText('00:50.4', { selector: '.rv__momentat' })).toBeTruthy()
            expect(screen.queryByRole('button', { name: /^Mark moment/ })).toBeNull()
            expect(screen.queryByRole('button', { name: 'Use the estimate instead' })).toBeNull()
            at(60)
            fireEvent.click(screen.getByRole('button', { name: /^Mark again/ }))
            expect(screen.getByText('01:00.0', { selector: '.rv__momentat' })).toBeTruthy()
            expect(screen.getByRole('group', { name: 'What was it?' })).toBeTruthy() // type step stays below
        })
        it('should show the estimate with Mark moment when the estimate is accepted', () => {
            render(<SuggestionReview onClose={() => {}} />)
            fireEvent.click(screen.getByRole('button', { name: 'Use the estimate instead' }))
            expect(screen.getByText('estimate', { selector: '.rv__chipnote' })).toBeTruthy()
            expect(screen.getByRole('button', { name: /^Mark moment/ })).toBeTruthy()
            expect(screen.getByRole('group', { name: 'What was it?' })).toBeTruthy()
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
            press('s'); press('1'); press('Enter')
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
        it('should clear a choice with Esc or Backspace', () => {
            render(<SuggestionReview onClose={() => {}} />)
            press('g')
            expect(screen.getByRole('button', { name: /^Confirm/ })).toBeTruthy()
            press('Escape')
            expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull()
            press('g'); press('Backspace')
            expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull()
            expect(useAppState.getState().events).toHaveLength(0)
        })
        it('should show the hint slot', async () => {
            const { SuggestionCard } = await import('./SuggestionCard')
            render(<SuggestionCard suggestion={useAppState.getState().suggestions[0]} index={0} total={2} onNext={() => {}} onSaved={() => {}} onPrev={() => {}} hint="Ball in Colours' goal" />)
            expect(screen.getByText("Ball in Colours' goal")).toBeTruthy()
        })
        describe('late ball tag', () => {
            const card = (extra: { preselectType?: 'goal' }) => {
                return import('./SuggestionCard').then(({ SuggestionCard }) => <SuggestionCard suggestion={useAppState.getState().suggestions[0]} index={0} total={2} onNext={() => {}} onSaved={() => {}} onPrev={() => {}} {...extra} />)
            }
            it('should not re-select Goal after the user cleared the choice on the open card', async () => {
                const { rerender } = render(await card({}))
                press('m'); press('s'); press('Escape')
                expect(screen.queryByRole('button', { name: 'Change what it was' })).toBeNull() // cleared
                rerender(await card({ preselectType: 'goal' }))
                expect(screen.getByRole('button', { name: /^Goal/ })).toHaveAttribute('aria-pressed', 'false')
                expect(screen.queryByRole('button', { name: 'Change what it was' })).toBeNull()
            })
            it('should still apply a late tag when the user has not touched the selection', async () => {
                const { rerender } = render(await card({}))
                press('m')
                rerender(await card({ preselectType: 'goal' }))
                expect(screen.getByRole('button', { name: 'Change what it was' })).toHaveTextContent('Goal')
            })
        })
        describe('Labs ball check', () => {
            it('should preselect Goal, but not the team, with no ball hint on the card', () => {
                useAppState.setState({ suggestions: useAppState.getState().suggestions.map((s, i) => (i === 0 ? { ...s, ball: { goal: 'team1' as const, frames: 3 } } : s)) })
                render(<SuggestionReview onClose={() => {}} />)
                expect(screen.queryByText(/Ball seen in a goal mouth/)).toBeNull()
                press('m')
                expect(screen.getByRole('button', { name: 'Change what it was' })).toHaveTextContent('Goal')
                // No team is pre-selected: not the first, and not the one the ball tag would have implied.
                expect(screen.getByRole('button', { name: /Whites/ })).toHaveAttribute('aria-pressed', 'false')
                expect(screen.getByRole('button', { name: /Colours/ })).toHaveAttribute('aria-pressed', 'false')
            })
            it('should give the same preselection and still no team after half time', () => {
                useAppState.setState({
                    events: [{ id: 'ht', type: 'half_time', matchTimeSec: 50, sourceFileIndex: 0 }] as never,
                    suggestions: useAppState.getState().suggestions.map((s, i) => (i === 0 ? { ...s, ball: { goal: 'team1' as const, frames: 2 } } : s)),
                })
                render(<SuggestionReview onClose={() => {}} />)
                expect(screen.queryByText(/Ball seen in a goal mouth/)).toBeNull()
                press('m')
                expect(screen.getByRole('button', { name: /Whites/ })).toHaveAttribute('aria-pressed', 'false') // nothing pre-selected, half time or not
                expect(screen.getByRole('button', { name: /Colours/ })).toHaveAttribute('aria-pressed', 'false')
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
                press('m'); press('s'); press('1'); press('Enter')
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
            it('should add "Top picks: N." to the summary', () => {
                useAppState.setState({ reviewIndex: 2, suggestions: useAppState.getState().suggestions.map((s) => ({ ...s, ball: { goal: 'team2' as const, frames: 2 } })) })
                render(<SuggestionReview onClose={() => {}} />)
                expect(screen.getByText('Top picks: 2.')).toBeTruthy()
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
            expect(seek).toHaveBeenCalledWith(0, 99.5) // window 95…104, halfway
            expect(screen.queryByTestId('rtl-marked')).toBeNull()
        })
        it('should ignore Shift with decision and window keys', () => {
            render(<SuggestionReview onClose={() => {}} />)
            for (const key of ['g', 'o', 's', 'h', 'x', 'm']) press(key, { shiftKey: true })
            expect(useAppState.getState().events).toHaveLength(0)
            expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull()
            expect(screen.getByText('−5 s … +4 s')).toBeTruthy()
        })
        it('should still extend the end when the total duration is unknown', () => {
            useAppState.setState({ files: [{ id: 'f', name: 'A.MP4', url: '', kind: 'full', file: new File([], 'A.MP4') }] as never })
            render(<SuggestionReview onClose={() => {}} />)
            fireEvent.click(screen.getByRole('button', { name: 'End 2 seconds later' }))
            expect(screen.getByText('−5 s … +6 s')).toBeTruthy()
        })
        it('should not loop while paused, and loop again when playing', () => {
            const seek = vi.fn()
            useAppState.setState({ seekToGoal: seek })
            setPlayerPaused(false)
            render(<SuggestionReview onClose={() => {}} />)
            act(() => { useAppState.setState({ currentTimeInFileSec: 96 }) }) // landed after the start seek
            seek.mockClear()
            act(() => { setPlayerPaused(true) })
            act(() => { useAppState.setState({ currentTimeInFileSec: 104.5 }) })
            expect(seek).not.toHaveBeenCalled()
            act(() => { setPlayerPaused(false) })
            act(() => { useAppState.setState({ currentTimeInFileSec: 104.6 }) })
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
            expect(screen.getByRole('button', { name: /^Discard/ })).toBeTruthy()
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
        it('should add the Ball check line to the diagnostics, or its error', async () => {
            const writeText = vi.fn(async () => {})
            Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
            toSummary()
            job.ballPhase = 'done'; job.ballEp = 'webgpu'; job.ballMs = 41200
            const { unmount } = render(<SuggestionReview onClose={() => {}} />)
            await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' })) })
            expect(String((writeText.mock.calls[0] as unknown[])[0])).toContain('Ball check: webgpu, 41 s, 0 tagged')
            unmount()
            job.ballPhase = 'failed'; job.ballError = "Ball check failed: this browser can't decode the video."; job.ballDetail = 'unsupported codec'
            render(<SuggestionReview onClose={() => {}} />)
            await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' })) })
            expect(String((writeText.mock.calls[1] as unknown[])[0])).toContain("Ball check: Ball check failed: this browser can't decode the video. (unsupported codec)")
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
        const withRange = (): void => { useAppState.setState({ events: [{ id: 'k', type: 'kick_off', matchTimeSec: 10, sourceFileIndex: 0 }, { id: 'w', type: 'final_whistle', matchTimeSec: 500, sourceFileIndex: 0 }] }) }
        it('should show the match start and end step after clearing when a marker is missing', () => {
            stale()
            startDetectionMock.mockClear()
            render(<SuggestionReview onClose={() => {}} />)
            fireEvent.click(screen.getByRole('button', { name: 'Find goals' }))
            fireEvent.click(screen.getByRole('button', { name: 'Clear and find goals' }))
            expect(useAppState.getState().suggestions).toEqual([])
            expect(startDetectionMock).not.toHaveBeenCalled()
            expect(screen.getByText('First, set where the match starts and ends.')).toBeTruthy()
        })
        it('should send Try again through the start form', () => {
            job.phase = 'failed'; job.error = 'no decoder'
            withRange()
            startDetectionMock.mockClear()
            render(<SuggestionReview onClose={() => {}} />)
            fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
            expect(startDetectionMock).not.toHaveBeenCalled()
            expect(screen.getByText('First, set where the match starts and ends.')).toBeTruthy()
        })
        it('should ask before clearing old suggestions, then clear and start', () => {
            stale(); withRange()
            startDetectionMock.mockClear()
            render(<SuggestionReview onClose={() => {}} />)
            fireEvent.click(screen.getByRole('button', { name: 'Find goals' }))
            expect(screen.getByRole('alertdialog', { name: 'Clear old suggestions' })).toHaveTextContent('Clear the old suggestions and look for goals in these videos?')
            expect(startDetectionMock).not.toHaveBeenCalled()
            fireEvent.click(screen.getByRole('button', { name: 'Clear and find goals' }))
            expect(useAppState.getState().suggestions).toEqual([])
            expect(startDetectionMock).not.toHaveBeenCalled()
            fireEvent.click(screen.getByRole('button', { name: /^Find goals/ })) // through the start form
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

describe('Find goals: match start and end step', () => {
    const ev = (id: string, type: 'kick_off' | 'final_whistle', t: number) => ({ id, type, matchTimeSec: t, sourceFileIndex: 0 })
    const open = (): void => { act(() => { openFindGoals() }) }
    beforeEach(() => {
        startDetectionMock.mockClear()
        useAppState.setState({ suggestions: [], suggestionRun: null, events: [], currentFileIndex: 0, currentTimeInFileSec: 403, undoStack: [] })
    })
    it('should show the step instead of starting when a marker is missing', () => {
        useAppState.setState({ events: [ev('k', 'kick_off', 10)] })
        render(<SuggestionReview onClose={() => {}} />)
        open()
        expect(startDetectionMock).not.toHaveBeenCalled()
        expect(screen.getByText('First, set where the match starts and ends.')).toBeTruthy()
        expect(screen.getByText('Scrub to the first kick, then to the final whistle.')).toBeTruthy()
        expect(screen.getByText('Beta')).toBeTruthy()
        expect(screen.getByText('00:10')).toBeTruthy()
        expect(screen.getByText('not set')).toBeTruthy()
    })
    it('should always show the form first, pre-filled and ready to confirm when both markers exist', () => {
        useAppState.setState({ events: [ev('k', 'kick_off', 10), ev('w', 'final_whistle', 500)] })
        render(<SuggestionReview onClose={() => {}} />)
        open()
        expect(startDetectionMock).not.toHaveBeenCalled()
        expect(screen.getByText('First, set where the match starts and ends.')).toBeTruthy()
        expect((screen.getByRole('button', { name: /^Find goals/ }) as HTMLButtonElement).disabled).toBe(false)
        fireEvent.click(screen.getByRole('button', { name: /^Find goals/ }))
        expect(startDetectionMock).toHaveBeenCalledWith({ ball: false })
    })
    it('should tag the markers at the playhead, moving an existing one, and enable Find goals', () => {
        useAppState.setState({ events: [ev('k', 'kick_off', 10)] })
        render(<SuggestionReview onClose={() => {}} />)
        open()
        const find = screen.getByRole('button', { name: /^Find goals/ }) as HTMLButtonElement
        expect(find.disabled).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: /Kick off is here/ }))
        expect(useAppState.getState().events.filter((e) => e.type === 'kick_off').map((e) => e.matchTimeSec)).toEqual([403])
        act(() => { useAppState.setState({ currentTimeInFileSec: 580 }) })
        fireEvent.click(screen.getByRole('button', { name: /Final whistle is here/ }))
        expect(useAppState.getState().events.find((e) => e.type === 'final_whistle')).toMatchObject({ matchTimeSec: 580, sourceFileIndex: 0 })
        expect(find.disabled).toBe(false)
        fireEvent.click(find)
        expect(startDetectionMock).toHaveBeenCalledWith({ ball: false })
    })
    it('should refuse a final whistle before kick off', () => {
        useAppState.setState({ events: [ev('k', 'kick_off', 300)] })
        render(<SuggestionReview onClose={() => {}} />)
        open()
        act(() => { useAppState.setState({ currentTimeInFileSec: 100 }) })
        fireEvent.click(screen.getByRole('button', { name: /Final whistle is here/ }))
        expect(screen.getByText('The final whistle must be after kick off.')).toBeTruthy()
        expect((screen.getByRole('button', { name: /^Find goals/ }) as HTMLButtonElement).disabled).toBe(true)
        press('Enter')
        expect(startDetectionMock).not.toHaveBeenCalled()
    })
    it('should start on the whole video with Skip', () => {
        render(<SuggestionReview onClose={() => {}} />)
        open()
        fireEvent.click(screen.getByRole('button', { name: 'Skip — use the whole video' }))
        expect(startDetectionMock).toHaveBeenCalledWith({ wholeVideo: true, ball: false })
    })
    it('should tag with K and W and start with Enter', () => {
        render(<SuggestionReview onClose={() => {}} />)
        open()
        press('k')
        act(() => { useAppState.setState({ currentTimeInFileSec: 580 }) })
        press('Enter')
        expect(startDetectionMock).not.toHaveBeenCalled()
        press('w', { repeat: true })
        expect(useAppState.getState().events.some((e) => e.type === 'final_whistle')).toBe(false)
        press('w')
        press('k', { metaKey: true })
        expect(useAppState.getState().events.map((e) => e.type)).toEqual(['kick_off', 'final_whistle'])
        press('Enter')
        expect(startDetectionMock).toHaveBeenCalledTimes(1)
    })
    it('should keep Space and the arrow keys working for the video', () => {
        const toggle = vi.fn(), seek = vi.fn()
        const offT = registerPlayerToggle(toggle), offS = registerPlayerSeekPaused(seek)
        render(<SuggestionReview onClose={() => {}} />)
        open()
        press(' '); press('ArrowRight')
        expect(toggle).toHaveBeenCalledTimes(1)
        expect(seek).toHaveBeenCalledWith(0, 408)
        offT(); offS()
    })
})

describe('Find goals: Advanced detection (Labs)', () => {
    const marks = { postL: { x: 0.4, y: 0.5 }, postR: { x: 0.6, y: 0.5 }, barL: { x: 0.4, y: 0.4 }, barR: { x: 0.6, y: 0.4 } }
    const TICK = 'Advanced detection'
    const ev = (id: string, type: 'kick_off' | 'final_whistle', t: number) => ({ id, type, matchTimeSec: t, sourceFileIndex: 0 })
    beforeEach(() => {
        startDetectionMock.mockClear()
        useAppState.setState({ suggestions: [], suggestionRun: null, events: [ev('k', 'kick_off', 10), ev('w', 'final_whistle', 500)] })
    })
    const open = (): void => { act(() => { openFindGoals() }) }
    it('should not show the tick box without Labs', () => {
        useAppState.setState({ labs: false, goalMarks: { team1: marks } })
        render(<SuggestionReview onClose={() => {}} />)
        open()
        expect(screen.queryByText(TICK)).toBeNull()
    })
    it('should be ticked by default when a goal is marked, and start with ball: true', () => {
        useAppState.setState({ labs: true, goalMarks: { team1: marks } })
        render(<SuggestionReview onClose={() => {}} />)
        open()
        const box = screen.getByRole('checkbox', { name: new RegExp(TICK) }) as HTMLInputElement
        expect(box.checked).toBe(true)
        expect(screen.getByText('Also look for the ball in the goal mouths. Slower: about 10 minutes for an hour of 4K.')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /^Find goals/ }))
        expect(startDetectionMock).toHaveBeenCalledWith({ ball: true })
    })
    it('should start with ball: false when unticked, and Skip keeps the tick box value', () => {
        useAppState.setState({ labs: true, goalMarks: { team1: marks } })
        render(<SuggestionReview onClose={() => {}} />)
        open()
        fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(TICK) }))
        fireEvent.click(screen.getByRole('button', { name: 'Skip — use the whole video' }))
        expect(startDetectionMock).toHaveBeenCalledWith({ wholeVideo: true, ball: false })
    })
    it('should be disabled and unticked with no goals marked, pointing to Match setup', () => {
        useAppState.setState({ labs: true, goalMarks: null })
        render(<SuggestionReview onClose={() => {}} />)
        open()
        const box = screen.getByRole('checkbox', { name: new RegExp(TICK) }) as HTMLInputElement
        expect(box.checked).toBe(false)
        expect(box.disabled).toBe(true)
        expect(screen.getByText('Mark the goals in Match setup first.')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Open Match setup' }))
        expect(useAppState.getState().panel).toBe('match')
    })
    it('should no longer show the post-run Match setup hint', () => {
        useAppState.setState({ labs: true, goalMarks: null })
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.queryByText('Mark the goals in Match setup to also check the goal mouths.')).toBeNull()
    })
    it('should offer Cancel on the form when there are suggestions to go back to', () => {
        useAppState.setState({ labs: false, goalMarks: null })
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        render(<SuggestionReview onClose={() => {}} />)
        act(() => { openFindGoals(true) })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(screen.getByText(/Suggestion 1 of 1/)).toBeTruthy()
    })
    it('should start with Enter using the tick box value', () => {
        useAppState.setState({ labs: true, goalMarks: { team1: marks } })
        render(<SuggestionReview onClose={() => {}} />)
        open()
        press('Enter')
        expect(startDetectionMock).toHaveBeenCalledWith({ ball: true })
    })
})

describe('Find goals: Top picks lane', () => {
    const tag = (i: number): void => { act(() => { useAppState.getState().setSuggestionBall(useAppState.getState().suggestions[i].id, { goal: 'team1', frames: 2 }) }) }
    beforeEach(() => {
        useAppState.setState({ suggestions: [], suggestionRun: null, events: [], reviewIndex: 0 })
        useAppState.getState().setSuggestions(run, [100, 200, 300, 400, 500].map((t) => ({ timeSec: t, score: 3 })))
        useAppState.setState({ reviewIndex: 0 })
    })
    const lane = (name: RegExp): HTMLElement => screen.getByRole('button', { name })
    it('should show no switch without Advanced detection', () => {
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.queryByRole('group', { name: 'Suggestions to review' })).toBeNull()
    })
    it('should show Top picks (2) left and Other moments (3) right once suggestions carry a ball tag, on the current suggestion\'s lane', () => {
        tag(1); tag(3)
        render(<SuggestionReview onClose={() => {}} />)
        const [first, second] = screen.getByRole('group', { name: 'Suggestions to review' }).querySelectorAll('button')
        expect(first.textContent).toMatch(/^Top picks \(2\)/)
        expect(second.textContent).toMatch(/^Other moments \(3\)/)
        expect(second.getAttribute('aria-pressed')).toBe('true') // review is at suggestion 1, an other moment
        expect(screen.getByText(/Suggestion 1 of 3/)).toBeTruthy()
        expect(screen.queryByRole('button', { name: /^All/ })).toBeNull()
    })
    it('should open on Top picks, at its first suggestion to review, when review is (re)opened with top picks left', () => {
        tag(1); tag(3)
        act(() => { openFindGoals() })
        expect(useAppState.getState().reviewIndex).toBe(1)
        render(<SuggestionReview onClose={() => {}} />)
        expect(lane(/^Top picks \(2\)/).getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
    })
    it('should open on Other moments when no top pick is left to review', () => {
        tag(1); tag(3)
        for (const i of [1, 3]) useAppState.getState().decideSuggestion(useAppState.getState().suggestions[i].id, { kind: 'reject' })
        act(() => { openFindGoals() })
        expect(useAppState.getState().reviewIndex).toBe(0)
        render(<SuggestionReview onClose={() => {}} />)
        expect(lane(/^Other moments/).getAttribute('aria-pressed')).toBe('true')
    })
    it('should count and navigate within Top picks only, then move on to the other moments at the end', () => {
        tag(1); tag(3)
        render(<SuggestionReview onClose={() => {}} />)
        fireEvent.click(lane(/^Top picks/))
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
        expect(useAppState.getState().reviewIndex).toBe(1)
        expect(screen.getByRole('button', { name: 'Previous suggestion' })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: /Next/ }))
        expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
        expect(useAppState.getState().reviewIndex).toBe(3)
        fireEvent.click(screen.getByRole('button', { name: 'Previous suggestion' }))
        expect(useAppState.getState().reviewIndex).toBe(1)
        fireEvent.click(screen.getByRole('button', { name: /Next/ }))
        fireEvent.click(screen.getByRole('button', { name: /Next/ })) // past the last top pick
        expect(lane(/^Other moments/).getAttribute('aria-pressed')).toBe('true')
        expect(useAppState.getState().reviewIndex).toBe(0)
        expect(toastStore.getState().toast?.text).toBe('Top picks done — on to other moments')
    })
    it('should remember where you were in each lane when switching', () => {
        tag(1); tag(3)
        useAppState.getState().decideSuggestion(useAppState.getState().suggestions[1].id, { kind: 'reject' })
        useAppState.setState({ reviewIndex: 2 })
        render(<SuggestionReview onClose={() => {}} />)
        fireEvent.click(lane(/^Top picks/))
        expect(useAppState.getState().reviewIndex).toBe(3) // first top pick still to review
        fireEvent.click(lane(/^Other moments/))
        expect(useAppState.getState().reviewIndex).toBe(2)
        expect(screen.getByText(/Suggestion 2 of 3/)).toBeTruthy()
    })
    it('should open the first top pick when all top picks are decided', () => {
        tag(1); tag(3)
        for (const i of [1, 3]) useAppState.getState().decideSuggestion(useAppState.getState().suggestions[i].id, { kind: 'reject' })
        render(<SuggestionReview onClose={() => {}} />)
        fireEvent.click(lane(/^Top picks/))
        expect(useAppState.getState().reviewIndex).toBe(1)
    })
    it('should switch to the first other moment still to review when the last top pick is decided', () => {
        tag(1); tag(3)
        render(<SuggestionReview onClose={() => {}} />)
        fireEvent.click(lane(/^Top picks/))
        press('x')
        expect(useAppState.getState().reviewIndex).toBe(3)
        expect(lane(/^Top picks/).getAttribute('aria-pressed')).toBe('true')
        dismissToast()
        press('g'); press('1'); press('Enter') // the last top pick
        expect(lane(/^Other moments/).getAttribute('aria-pressed')).toBe('true')
        expect(useAppState.getState().reviewIndex).toBe(0)
        expect(screen.getByText(/Suggestion 1 of 3/)).toBeTruthy()
        expect(toastStore.getState().toast?.text).toBe('Top picks done — on to other moments')
    })
    it('should not badge a top pick on the card (the lane says it)', () => {
        tag(0)
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.queryByText('Top pick')).toBeNull()
        expect(screen.queryByText(/Ball seen in a goal mouth/)).toBeNull()
    })
    it('should give the lane switch icons, with a star on Top picks', () => {
        tag(0)
        render(<SuggestionReview onClose={() => {}} />)
        expect(lane(/^Top picks/).querySelector('.lanes__star')).not.toBeNull()
        expect(lane(/^Other moments/).querySelector('.lanes__icon')).not.toBeNull()
    })
    it('should update the Top picks count live with a brief +1, without changing the current card', () => {
        job.ballPhase = 'running'; job.ballEp = 'webgpu'; job.ballFraction = 0.4
        render(<SuggestionReview onClose={() => {}} />)
        expect(lane(/^Top picks \(0\)/)).toBeTruthy()
        expect(screen.getByText('Checking the goal mouths… 40%')).toBeTruthy()
        tag(3)
        expect(lane(/^Top picks \(1\)/)).toBeTruthy()
        expect(screen.getByText('+1')).toBeTruthy()
        expect(screen.getByText(/Suggestion 1 of 4/)).toBeTruthy() // the tagged one moved out of Other moments
        expect(lane(/^Other moments \(4\)/).getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByText('Checking the goal mouths… 40% · 1 top pick so far')).toBeTruthy()
        tag(1)
        expect(screen.getByText('Checking the goal mouths… 40% · 2 top picks so far')).toBeTruthy()
    })
    it('should keep the current card when a tag arrives while in Top picks', () => {
        job.ballPhase = 'running'; job.ballEp = 'webgpu'
        render(<SuggestionReview onClose={() => {}} />)
        tag(1)
        fireEvent.click(lane(/^Top picks/))
        tag(3)
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
        expect(useAppState.getState().reviewIndex).toBe(1)
    })
    it('should say so when the ball check finished with no top picks', () => {
        job.ballPhase = 'done'
        render(<SuggestionReview onClose={() => {}} />)
        fireEvent.click(lane(/^Top picks \(0\)/))
        expect(screen.getByText("No top picks — the ball wasn't seen in a goal for any suggestion.")).toBeTruthy()
        fireEvent.click(lane(/^Other moments/))
        expect(screen.getByText(/Suggestion 1 of 5/)).toBeTruthy()
    })
    it('should list Top picks in the summary', () => {
        tag(0); tag(2)
        render(<SuggestionReview onClose={() => {}} />)
        for (let i = 0; i < 5; i++) { press('x'); press('Enter') }
        expect(screen.getByText('Top picks: 2.')).toBeTruthy()
    })
})

describe('Review loop keys', () => {
    it('should publish the window shown (with extensions) for tags made during the review', () => {
        render(<SuggestionReview onClose={() => {}} />)
        expect(getReviewWindow()).toMatchObject({ startAbs: 95, endAbs: 104 })
        press('}', { shiftKey: true }); press('}', { shiftKey: true })
        expect(getReviewWindow()?.endAbs).toBe(108)
    })
    it('should extend the loop with { and } (Shift+[ and Shift+]) and show the keys on the +2 s handles', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('{', { shiftKey: true })
        expect(screen.getByText('−7 s … +4 s')).toBeTruthy()
        press('}', { shiftKey: true })
        expect(screen.getByText('−7 s … +6 s')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Start 2 seconds earlier' }).textContent).toContain('{')
        expect(screen.getByRole('button', { name: 'End 2 seconds later' }).textContent).toContain('}')
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy() // [ and ] still move between suggestions
    })
})

describe('Review keys', () => {
    it('should seek with the arrows like the editor, and move between suggestions with [ and ]', () => {
        const run2 = vi.fn()
        const off = registerPlayerShortcut(run2)
        render(<SuggestionReview onClose={() => {}} />)
        press('ArrowRight'); press('ArrowLeft', { shiftKey: true }); press(',')
        expect(run2.mock.calls.map((c) => c[0])).toEqual(['seekForward', 'seekBackFine', 'speedDown'])
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy() // arrows no longer move between suggestions
        press(']')
        expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
        press('[')
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
        off()
    })
    it('should show [ and ] on the Previous and Next buttons', () => {
        useAppState.setState({ reviewIndex: 1 })
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByRole('button', { name: 'Previous suggestion' }).textContent).toContain('[')
        expect(screen.getByRole('button', { name: /^Next/ }).textContent).toContain(']')
    })
})

describe('Review actions: move, discard, confirm', () => {
    it('should only move with Previous and Next, never deciding', () => {
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.queryByRole('button', { name: /Skip/ })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /Next/ }))
        expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Previous suggestion' }))
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
        expect(useAppState.getState().suggestions.map((x) => x.status)).toEqual(['pending', 'pending'])
        fireEvent.click(screen.getByRole('button', { name: /Next/ }))
        fireEvent.click(screen.getByRole('button', { name: /Next/ }))
        expect(screen.getByText('You kept 0 of 2.')).toBeTruthy() // Next on the last goes to the summary
    })
    it('should discard with one press of X, move on, and drop the ring from the match strip state', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('x')
        expect(useAppState.getState().suggestions[0].status).toBe('rejected')
        expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
    })
    it('should discard from the Discard button, also before marking', () => {
        render(<SuggestionReview onClose={() => {}} />)
        const b = screen.getByRole('button', { name: /^Discard/ })
        expect(b.className).toContain('rv__quiet')
        fireEvent.click(b)
        expect(useAppState.getState().suggestions[0].status).toBe('rejected')
        expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
    })
    it('should confirm with Enter and the Confirm button', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('s'); press('1'); press('Enter')
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'save' })
        expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
    })
    it('should show Discarded with Restore on a discarded suggestion, and Restore puts it back to pending', () => {
        act(() => { useAppState.getState().decideSuggestion(useAppState.getState().suggestions[0].id, { kind: 'reject' }) })
        useAppState.setState({ reviewIndex: 0 })
        render(<SuggestionReview onClose={() => {}} />)
        expect(screen.getByText('Discarded')).toBeTruthy()
        expect(screen.queryByText('Not a goal')).toBeNull()
        expect(screen.queryByRole('button', { name: /^Discard/ })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
        expect(useAppState.getState().suggestions[0].status).toBe('pending')
        expect(screen.queryByText('Discarded')).toBeNull()
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
    })
    it('should undo a discard with the store undo and return to that card', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('x')
        expect(screen.getByText(/Suggestion 2 of 2/)).toBeTruthy()
        act(() => { useAppState.getState().undo() })
        expect(useAppState.getState().suggestions[0].status).toBe('pending')
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
    })
})


describe('Review toasts', () => {
    beforeEach(() => { dismissToast() })
    it('should confirm with a toast naming type, team and match clock', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('g'); press('1'); press('Enter')
        expect(toastStore.getState().toast?.text).toMatch(/^Goal · Whites confirmed at \d\d:\d\d(\.\d)?$/)
        expect(toastStore.getState().toast?.action).toBeUndefined()
    })
    it('should discard with a toast and an Undo that restores the suggestion and returns to its card', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('x')
        const toast = toastStore.getState().toast
        expect(toast?.text).toMatch(/^Discarded \d\d:\d\d/)
        expect(toast?.action?.label).toBe('Undo')
        act(() => { toast?.action?.run() })
        expect(useAppState.getState().suggestions[0].status).toBe('pending')
        expect(screen.getByText(/Suggestion 1 of 2/)).toBeTruthy()
    })
    it('should not toast for moving, marking or scrubbing', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press(']'); press('m')
        fireEvent.click(screen.getByRole('button', { name: /Next/ }))
        expect(toastStore.getState().toast).toBeNull()
    })
})

describe('Review scorer and assist', () => {
    beforeEach(() => { dismissToast(); useAppState.setState({ teams: [{ name: 'Whites', color: '#fff', roster: ['Sandy'] }, { name: 'Colours', color: '#000', roster: [] }] }) })
    const field = (name: string): HTMLElement => screen.getByRole('textbox', { name })
    it('should ask for the scorer after type and team, filter the roster, and save scorer and assist with the event', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('g'); expect(screen.queryByRole('textbox')).toBeNull() // after the team
        press('1')
        fireEvent.change(field('Scorer'), { target: { value: 'sa' } })
        expect(screen.getByRole('option', { name: 'Sandy' })).toBeTruthy()
        fireEvent.keyDown(field('Scorer'), { key: 'Enter' })
        fireEvent.change(field('Assist'), { target: { value: 'Newbie' } })
        fireEvent.keyDown(field('Assist'), { key: 'Enter' })
        expect(screen.queryByRole('textbox', { name: 'Assist' })).toBeNull()
        press('Enter') // confirm
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'goal', team: 'Whites', scorer: 'Sandy', assist: 'Newbie' })
        expect(useAppState.getState().teams[0].roster).toContain('Newbie')
        expect(toastStore.getState().toast?.text).toMatch(/^Goal · Whites · Sandy confirmed at/)
    })
    it('should keep the scorer in the assist list, disabled and in place, names alphabetical', () => {
        useAppState.setState({ teams: [{ name: 'Whites', color: '#fff', roster: ['Sandy', 'zoe', 'Sam', 'Bob'] }, { name: 'Colours', color: '#000', roster: [] }] })
        render(<SuggestionReview onClose={() => {}} />)
        press('g'); press('1')
        const names = (): (string | null)[] => screen.getAllByRole('option').map((o) => o.textContent)
        expect(names()).toEqual(['Bob', 'Sam', 'Sandy', 'zoe'])
        fireEvent.click(screen.getByRole('option', { name: 'Sam' }))
        expect(names()).toEqual(['Bob', 'Sam', 'Sandy', 'zoe'])
        const scorer = screen.getByRole('option', { name: 'Sam' })
        expect(scorer).toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(scorer)
        expect(screen.getByRole('textbox', { name: 'Assist' })).toBeTruthy()
        fireEvent.keyDown(field('Assist'), { key: 'ArrowDown' }) // Bob (first) -> Sandy, skipping Sam
        expect(screen.getByRole('option', { name: 'Sandy' })).toHaveAttribute('aria-selected', 'true')
    })
    it('should ask a save for its team and the goalkeeper, like the picker', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('s')
        expect(screen.getByRole('group', { name: 'Which team made the save?' })).toBeTruthy()
        expect(screen.getByRole('button', { name: /^Confirm/ })).toBeDisabled()
        press('2')
        expect(field('Goalkeeper')).toBeTruthy()
        fireEvent.change(field('Goalkeeper'), { target: { value: 'Keeper K' } })
        fireEvent.keyDown(field('Goalkeeper'), { key: 'Enter' })
        press('Enter')
        expect(useAppState.getState().events[0]).toMatchObject({ type: 'save', team: 'Colours', scorer: 'Keeper K' })
    })
    it('should skip both with Tab, and still confirm with Enter', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('g'); press('1')
        fireEvent.keyDown(field('Scorer'), { key: 'Tab' })
        expect(screen.queryByRole('textbox')).toBeNull()
        press('Enter')
        expect(useAppState.getState().events[0].scorer).toBeUndefined()
    })
    it('should ask nobody for a highlight', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('h')
        expect(screen.queryByRole('textbox')).toBeNull()
    })
    it('should name the own goal player field like the picker', () => {
        render(<SuggestionReview onClose={() => {}} />)
        press('o'); press('1')
        expect(field('Own goal by')).toBeTruthy()
    })
})
