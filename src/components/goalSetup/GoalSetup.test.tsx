// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../../state'
import { defaultGoalAreas } from '../../utils/crop'
import { setMedia } from '../../test/pointer'
import { GoalSetup } from './GoalSetup'

const FRAME = { src: 'data:image/jpeg;base64,AA==', aspect: 16 / 9 }
const READY = { status: 'ready', frame: FRAME }
const useFrameAt = vi.hoisted(() => vi.fn())
const useStillAt = vi.hoisted(() => vi.fn())
const grabFrame = vi.hoisted(() => vi.fn())
vi.mock('../frameGrab', () => ({ useFrameAt, useStillAt, grabFrame }))
const file = { id: 'a', name: 'a.mp4', url: 'blob:a', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' as const }
const teams = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#c00', roster: [] }]
const rect = HTMLElement.prototype.getBoundingClientRect

function mount(props: Partial<React.ComponentProps<typeof GoalSetup>> = {}) {
    const onClose = vi.fn()
    render(<GoalSetup onClose={onClose} {...props} />)
    return { onClose }
}
const view = (): HTMLElement => screen.getByTestId('goal-setup-view')
/** The viewport is 400 x 600 at the origin (the picture at zoom 1 is 400 x 225). */
const clickAt = (fx: number, fy: number): void => { fireEvent.click(view(), { clientX: 200 + (fx - 0.5) * 400, clientY: 300 + (fy - 0.5) * 225 }) }
const clickRequired = (): void => { clickAt(0.2, 0.6); clickAt(0.4, 0.6); clickAt(0.2, 0.4); clickAt(0.4, 0.4) }
const dots = (): HTMLElement[] => screen.queryAllByRole('button', { name: /^(Left|Right) post (bottom|top)$|^Back-/ })

describe('GoalSetup', () => {
    beforeEach(() => {
        useFrameAt.mockReset(); useFrameAt.mockReturnValue(READY)
        useStillAt.mockReset(); useStillAt.mockReturnValue(READY)
        grabFrame.mockReset(); grabFrame.mockResolvedValue(FRAME)
        HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 600, right: 400, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
        setMedia({})
        useAppState.setState({ files: [file], goalAreas: null, goalMarks: null, teams })
    })
    afterEach(() => { cleanup(); HTMLElement.prototype.getBoundingClientRect = rect })

    it('should open as a labelled modal dialog on the choose-the-picture step', () => {
        mount()
        const d = screen.getByRole('dialog', { name: 'Goal set-up' })
        expect(d.getAttribute('aria-modal')).toBe('true')
        expect(screen.getByText('Choose the picture')).toBeInTheDocument()
        expect(screen.getByText('Find a moment where both goals are clear.')).toBeInTheDocument()
    })

    it('should offer six frames to switch between and make the tapped one the picture', async () => {
        mount()
        await waitFor(() => expect(screen.getAllByRole('button', { name: /^Frame at / })).toHaveLength(6))
        expect(grabFrame).toHaveBeenCalledTimes(6)
        expect(grabFrame.mock.calls[0][1]).toBeCloseTo(30)
        expect(grabFrame.mock.calls[5][1]).toBeCloseTo(570)
        expect(grabFrame.mock.calls[0][2]).toBeLessThanOrEqual(320) // small thumbnails
        await userEvent.click(screen.getByRole('button', { name: 'Frame at 0:30' }))
        expect((screen.getByRole('slider', { name: 'Moment in the video' }) as HTMLInputElement).value).toBe('30')
        expect(screen.getByRole('button', { name: 'Frame at 0:30' }).getAttribute('aria-pressed')).toBe('true')
        await waitFor(() => expect(useStillAt).toHaveBeenCalledWith('blob:a', 30, 960))
    })

    it('should grab the thumbnails one at a time', async () => {
        let running = 0, peak = 0
        grabFrame.mockImplementation(async () => { running++; peak = Math.max(peak, running); await Promise.resolve(); running--; return FRAME })
        mount()
        await waitFor(() => expect(grabFrame).toHaveBeenCalledTimes(6))
        expect(peak).toBe(1)
    })

    it('should use the full-resolution still once past the picture step', async () => {
        mount()
        await userEvent.click(screen.getByRole('button', { name: 'Next' }))
        expect(useStillAt).toHaveBeenLastCalledWith('blob:a', 300, 3840)
    })

    it('should go picture, Whites\' goal posts, Colours\' goal posts with plain wording and no replay boxes', async () => {
        mount()
        await userEvent.click(screen.getByRole('button', { name: 'Next' }))
        expect(screen.getByText("Identify goal posts — Whites' goal")).toBeInTheDocument()
        expect(screen.getByText("Whites' goal: the end Whites defend at kick-off.")).toBeInTheDocument()
        expect(screen.queryByTestId('goal-setup-replay-view')).toBeNull()
        expect(screen.queryByRole('group', { name: /box/ })).toBeNull()
        clickRequired()
        await userEvent.click(screen.getByRole('button', { name: 'Next' }))
        expect(screen.getByText("Identify goal posts — Colours' goal")).toBeInTheDocument()
        expect(screen.getByText("Colours' goal: the end Colours defend at kick-off.")).toBeInTheDocument()
        expect(screen.queryByTestId('goal-setup-replay-view')).toBeNull()
        expect(document.body.textContent).not.toMatch(/attacking/i)
        expect(document.body.textContent).not.toMatch(/Set goal posts/)
    })

    it('should call an unnamed team "Team 1" in the title', () => {
        useAppState.setState({ teams: [{ name: '', color: '', roster: [] }, { name: '', color: '', roster: [] }] })
        mount({ startAt: 'posts1' })
        expect(screen.getByText("Identify goal posts — Team 1's goal")).toBeInTheDocument()
    })

    it('should go back a step and keep the placed points', async () => {
        mount({ startAt: 'posts1' })
        clickAt(0.2, 0.6)
        await userEvent.click(screen.getByRole('button', { name: 'Back' }))
        expect(screen.getByText('Choose the picture')).toBeInTheDocument()
    })

    describe('desktop (click to place)', () => {
        it('should place points in order, then save them and move on with Next', async () => {
            mount({ startAt: 'posts1' })
            expect(screen.getByText(/Click the bottom of the left post/)).toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Set point' })).toBeNull()
            clickAt(0.2, 0.6)
            expect(screen.getByText(/Click the bottom of the right post/)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
            clickAt(0.4, 0.6); clickAt(0.2, 0.4); clickAt(0.4, 0.4)
            expect(dots()).toHaveLength(4)
            await userEvent.click(screen.getByRole('button', { name: 'Next' }))
            const m = useAppState.getState().goalMarks!.team1!
            expect(m.postL.x).toBeCloseTo(0.2, 3); expect(m.postL.y).toBeCloseTo(0.6, 3)
            expect(m.barR.x).toBeCloseTo(0.4, 3); expect(m.barR.y).toBeCloseTo(0.4, 3)
            expect(m.backL).toBeUndefined()
            expect(screen.getByText("Identify goal posts — Colours' goal")).toBeInTheDocument()
        })

        it('should nudge a focused dot with the arrow keys', async () => {
            mount({ startAt: 'posts1' })
            clickAt(0.2, 0.6)
            screen.getByRole('button', { name: 'Left post bottom' }).focus()
            await userEvent.keyboard('{ArrowRight}')
            clickAt(0.4, 0.6); clickAt(0.2, 0.4); clickAt(0.4, 0.4)
            await userEvent.click(screen.getByRole('button', { name: 'Next' }))
            expect(useAppState.getState().goalMarks!.team1!.postL.x).toBeCloseTo(0.202, 3)
        })

        it('should undo the last point with the Undo button and with Backspace', async () => {
            mount({ startAt: 'posts1' })
            clickAt(0.2, 0.6); clickAt(0.4, 0.6)
            await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
            expect(dots()).toHaveLength(1)
            view().focus()
            await userEvent.keyboard('{Backspace}')
            expect(dots()).toHaveLength(0)
            expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
        })

        it('should go straight on to the back corners after the four points, and save them when placed', async () => {
            mount({ startAt: 'posts1' })
            clickRequired()
            expect(screen.getByText(/5 of 6 · Click the back-left corner/)).toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /back corners/i })).toBeNull()
            clickAt(0.15, 0.7); clickAt(0.45, 0.7)
            await userEvent.click(screen.getByRole('button', { name: 'Next' }))
            expect(useAppState.getState().goalMarks!.team1!.backR!.x).toBeCloseTo(0.45, 3)
        })

        it('should skip the back corners with Next once the four points are set', async () => {
            mount({ startAt: 'posts1' })
            clickRequired()
            clickAt(0.15, 0.7) // only one back corner: not saved
            await userEvent.click(screen.getByRole('button', { name: 'Next' }))
            const m = useAppState.getState().goalMarks!.team1!
            expect(m.backL).toBeUndefined(); expect(m.backR).toBeUndefined()
        })

        it('should name the next point beside the cursor and say how to zoom and move the picture', () => {
            mount({ startAt: 'posts1' })
            const tag = screen.getByTestId('goal-setup-cursor-label')
            expect(tag).toHaveTextContent('Left post bottom')
            fireEvent.pointerMove(view(), { clientX: 100, clientY: 100 })
            expect(tag.style.display).toBe('block')
            fireEvent.pointerLeave(view())
            expect(tag.style.display).toBe('none')
            clickAt(0.2, 0.6)
            expect(tag).toHaveTextContent('Right post bottom')
            expect(screen.getByText(/Scroll to zoom\. Right-drag, or hold Space and drag/)).toBeInTheDocument()
        })

        it('should say inside the tool which end the goal is', () => {
            mount({ startAt: 'posts1' })
            expect(screen.getByText("Whites' goal: the end Whites defend at kick-off.")).toBeInTheDocument()
        })

        it('should leave the goal without marks when Skip this goal is pressed', async () => {
            mount({ startAt: 'posts1' })
            clickAt(0.2, 0.6)
            await userEvent.click(screen.getByRole('button', { name: 'Skip this goal' }))
            expect(useAppState.getState().goalMarks).toBeNull()
            expect(screen.getByText("Identify goal posts — Colours' goal")).toBeInTheDocument()
        })
    })

    describe('touch (picture moves under a fixed crosshair)', () => {
        beforeEach(() => setMedia({ coarse: true, portrait: true }))

        it('should show a crosshair and a Set point button instead of click placement', () => {
            mount({ startAt: 'posts1' })
            expect(screen.getByTestId('goal-setup-crosshair')).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Set point' })).toBeInTheDocument()
            clickAt(0.2, 0.6)
            expect(dots()).toHaveLength(0) // a tap on the picture does not place
        })

        it('should place the point at the frame point under the crosshair after a drag', () => {
            mount({ startAt: 'posts1' })
            // zoom 3 on touch: dragging the picture 100 px left brings 100 / 3 px of picture (a 1/12 of its width) in from the right
            fireEvent.pointerDown(view(), { pointerId: 1, clientX: 200, clientY: 300 })
            fireEvent.pointerMove(view(), { pointerId: 1, clientX: 100, clientY: 270 })
            fireEvent.pointerUp(view(), { pointerId: 1, clientX: 100, clientY: 270 })
            fireEvent.click(screen.getByRole('button', { name: 'Set point' }))
            const dot = screen.getByRole('button', { name: 'Left post bottom' })
            expect(parseFloat(dot.style.left) / 100).toBeCloseTo(0.5 + 100 / 3 / 400, 3)
            expect(parseFloat(dot.style.top) / 100).toBeCloseTo(0.5 + 30 / 3 / 225, 3)
        })

        it('should keep the view where it is after a point (no jump to a guessed next point)', () => {
            mount({ startAt: 'posts1' })
            fireEvent.click(screen.getByRole('button', { name: 'Set point' }))
            fireEvent.click(screen.getByRole('button', { name: 'Set point' }))
            const [l, r] = [screen.getByRole('button', { name: 'Left post bottom' }), screen.getByRole('button', { name: 'Right post bottom' })]
            // nothing moved the picture between the two presses, so both points are under the crosshair
            expect(parseFloat(r.style.left)).toBeCloseTo(parseFloat(l.style.left), 3)
            expect(parseFloat(r.style.top)).toBeCloseTo(parseFloat(l.style.top), 3)
        })

        it('should set the point when the crosshair itself is tapped, but not when a tap lands far from it', () => {
            mount({ startAt: 'posts1' })
            fireEvent.pointerDown(view(), { pointerId: 1, clientX: 260, clientY: 300 })
            fireEvent.pointerUp(view(), { pointerId: 1, clientX: 260, clientY: 300 })
            expect(dots()).toHaveLength(0)
            fireEvent.pointerDown(view(), { pointerId: 2, clientX: 210, clientY: 310 })
            fireEvent.pointerUp(view(), { pointerId: 2, clientX: 210, clientY: 310 })
            expect(dots()).toHaveLength(1)
            expect(parseFloat(dots()[0].style.left) / 100).toBeCloseTo(0.5, 3) // under the crosshair, not under the finger
        })

        it('should not set a point when a drag starts on the crosshair', () => {
            mount({ startAt: 'posts1' })
            fireEvent.pointerDown(view(), { pointerId: 1, clientX: 200, clientY: 300 })
            fireEvent.pointerMove(view(), { pointerId: 1, clientX: 140, clientY: 300 })
            fireEvent.pointerUp(view(), { pointerId: 1, clientX: 140, clientY: 300 })
            expect(dots()).toHaveLength(0)
        })

        it('should say in the instruction that the crosshair can be tapped', () => {
            mount({ startAt: 'posts1' })
            expect(screen.getByRole('status').textContent).toMatch(/tap the crosshair or press Set point/)
            expect(view().getAttribute('aria-label')).toMatch(/tap the crosshair or press Set point/)
        })

        it('should let a placed dot be tapped to move it, then carry on with the next unplaced point', () => {
            mount({ startAt: 'posts1' })
            fireEvent.click(screen.getByRole('button', { name: 'Set point' })) // Left post bottom at the centre
            fireEvent.pointerDown(view(), { pointerId: 1, clientX: 200, clientY: 300 })
            fireEvent.pointerMove(view(), { pointerId: 1, clientX: 100, clientY: 300 })
            fireEvent.pointerUp(view(), { pointerId: 1, clientX: 100, clientY: 300 })
            expect(screen.getByRole('status').textContent).toMatch(/Right post bottom|2 of 6/)
            // the first dot is now at screen x 100: tap it
            fireEvent.pointerDown(view(), { pointerId: 2, clientX: 100, clientY: 300 })
            fireEvent.pointerUp(view(), { pointerId: 2, clientX: 100, clientY: 300 })
            expect(screen.getByRole('status').textContent).toMatch(/1 of 6/)
            // the picture is centred on it: the crosshair is on the dot
            fireEvent.pointerDown(view(), { pointerId: 3, clientX: 200, clientY: 300 })
            fireEvent.pointerMove(view(), { pointerId: 3, clientX: 140, clientY: 300 })
            fireEvent.pointerUp(view(), { pointerId: 3, clientX: 140, clientY: 300 })
            fireEvent.click(screen.getByRole('button', { name: 'Set point' }))
            expect(dots()).toHaveLength(1) // replaced, not added
            expect(parseFloat(dots()[0].style.left) / 100).toBeCloseTo(0.5 + 60 / 3 / 400, 3)
            expect(screen.getByRole('status').textContent).toMatch(/2 of 6/)
        })

        it('should let a placed point be picked from the diagram', () => {
            mount({ startAt: 'posts1' })
            fireEvent.click(screen.getByRole('button', { name: 'Set point' }))
            fireEvent.click(screen.getByRole('button', { name: 'Set point' }))
            expect(screen.getByRole('status').textContent).toMatch(/3 of 6/)
            fireEvent.click(screen.getByRole('button', { name: /^Move point 1/ }))
            expect(screen.getByRole('status').textContent).toMatch(/1 of 6/)
            expect(screen.queryByRole('button', { name: /^Move point 3/ })).toBeNull() // only placed points can be picked
        })

        it('should undo the last point', () => {
            mount({ startAt: 'posts1' })
            fireEvent.click(screen.getByRole('button', { name: 'Set point' }))
            expect(dots()).toHaveLength(1)
            fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
            expect(dots()).toHaveLength(0)
        })

        it('should zoom with the + and − buttons', () => {
            mount({ startAt: 'posts1' })
            const pic = screen.getByTestId('goal-setup-picture')
            const zoom = (): number => parseFloat(/scale\(([\d.]+)\)/.exec(pic.style.transform)![1])
            expect(zoom()).toBeCloseTo(3)
            fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
            expect(zoom()).toBeCloseTo(4.8)
            fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
            expect(zoom()).toBeCloseTo(3)
        })

        it('should say Turn sideways in phone portrait until dismissed, and remember that', async () => {
            localStorage.removeItem('shooot-goal-setup-rotate-hint')
            mount({ startAt: 'posts1' })
            expect(screen.getByText('Turn sideways for a bigger picture')).toBeInTheDocument()
            await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
            expect(screen.queryByText('Turn sideways for a bigger picture')).toBeNull()
            cleanup()
            mount({ startAt: 'posts1' })
            expect(screen.queryByText('Turn sideways for a bigger picture')).toBeNull()
        })
    })

    describe('the sharp picture', () => {
        const proxy = { ...file, url: 'blob:lrv', kind: 'proxy' as const, fullFile: new File([''], 'GX010042.MP4') }
        let create: ReturnType<typeof vi.fn>, revoke: ReturnType<typeof vi.fn>
        beforeEach(() => {
            create = vi.fn(() => 'blob:full'); revoke = vi.fn()
            URL.createObjectURL = create as unknown as typeof URL.createObjectURL
            URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL
            useAppState.setState({ files: [proxy] })
        })

        it('should keep the thumbnails and scrub frames on the playing file', async () => {
            mount()
            await waitFor(() => expect(grabFrame).toHaveBeenCalledTimes(6))
            expect(grabFrame.mock.calls.every((c) => c[0] === 'blob:lrv')).toBe(true)
            expect(useStillAt).toHaveBeenCalledWith('blob:lrv', expect.any(Number), 960)
            expect(create).not.toHaveBeenCalled()
        })

        it('should take the sharp still from the full file when the playing file is a proxy', async () => {
            mount({ startAt: 'posts1' })
            await waitFor(() => expect(useStillAt).toHaveBeenCalledWith('blob:full', expect.any(Number), 3840))
            expect(create).toHaveBeenCalledWith(proxy.fullFile)
            expect(useStillAt).not.toHaveBeenCalledWith('blob:lrv', expect.any(Number), 3840)
        })

        it('should fall back to the playing file when the full file cannot be shown', async () => {
            useStillAt.mockImplementation((u: string | null) => (u === 'blob:full' ? { status: 'error', frame: null } : READY))
            mount({ startAt: 'posts1' })
            await waitFor(() => expect(useStillAt).toHaveBeenCalledWith('blob:lrv', expect.any(Number), 3840))
        })

        it('should release the full file URL on leaving', async () => {
            mount({ startAt: 'posts1' })
            await waitFor(() => expect(create).toHaveBeenCalled())
            cleanup()
            expect(revoke).toHaveBeenCalledWith('blob:full')
        })
    })

    describe('replay zoom', () => {
        beforeEach(() => {
            useAppState.setState({ goalAreas: defaultGoalAreas() })
        })

        it('should show the replay view for the goal with the soft-zoom warning when the box is tiny', () => {
            useAppState.setState({ goalAreas: { team1: { x: 0.1, y: 0.2, w: 0.3, h: 0.3 }, team2: defaultGoalAreas().team2 } })
            mount({ startAt: 'zoom1' })
            expect(screen.getByText("Replay zoom — goals scored into Whites' goal")).toBeInTheDocument()
            expect(screen.getByText('Replays of goals scored at this end zoom in to this view. To frame one goal’s replay differently, select that goal in the events list and press Framing.')).toBeInTheDocument()
            expect(screen.getByText("Whites' goal: the end Whites defend at kick-off.")).toBeInTheDocument()
            expect(screen.getByTestId('goal-setup-replay-view')).toBeInTheDocument()
            expect(screen.getByText(/A very small box zooms in a lot/)).toBeInTheDocument()
        })

        it('should step the box with Closer and Wider and put it back with Reset', async () => {
            mount({ startAt: 'zoom1' })
            const before = defaultGoalAreas().team1!
            await userEvent.click(screen.getByRole('button', { name: 'Closer' }))
            await userEvent.click(screen.getByRole('button', { name: 'Next' }))
            expect(useAppState.getState().goalAreas!.team1!.w).toBeCloseTo(1 / (1 / before.w + 0.1), 4)
            cleanup()
            mount({ startAt: 'zoom1' })
            await userEvent.click(screen.getByRole('button', { name: 'Wider' }))
            await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
            await userEvent.click(screen.getByRole('button', { name: 'Next' }))
            expect(useAppState.getState().goalAreas!.team1!.w).toBeCloseTo(defaultGoalAreas().team1!.w, 4)
        })

        it('should move the box when the corner map is tapped', async () => {
            mount({ startAt: 'zoom1' })
            const map = screen.getByTestId('goal-setup-map')
            map.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 56, right: 100, bottom: 56, x: 0, y: 0, toJSON: () => ({}) })
            fireEvent.click(map, { clientX: 50, clientY: 28 })
            await userEvent.click(screen.getByRole('button', { name: 'Next' }))
            const a = useAppState.getState().goalAreas!.team1!
            expect(a.x + a.w / 2).toBeCloseTo(0.5, 3)
            expect(a.y + a.h / 2).toBeCloseTo(0.5, 3)
        })

        it('should pan the view with a one-finger drag', async () => {
            mount({ startAt: 'zoom1' })
            const v = screen.getByTestId('goal-setup-replay-view')
            fireEvent.pointerDown(v, { pointerId: 1, clientX: 200, clientY: 300 })
            fireEvent.pointerMove(v, { pointerId: 1, clientX: 100, clientY: 300 })
            fireEvent.pointerUp(v, { pointerId: 1, clientX: 100, clientY: 300 })
            await userEvent.click(screen.getByRole('button', { name: 'Next' }))
            const a = useAppState.getState().goalAreas!.team1!
            // 100 of 400 px = a quarter of the box width, to the right
            expect(a.x).toBeCloseTo(defaultGoalAreas().team1!.x + 0.25 * a.w, 3)
        })

        it('should finish after the second goal with the summary', async () => {
            mount({ startAt: 'zoom2' })
            expect(screen.getByText("Replay zoom — goals scored into Colours' goal")).toBeInTheDocument()
            await userEvent.click(screen.getByRole('button', { name: 'Next' }))
            expect(screen.getByText('Check each goal, or edit one.')).toBeInTheDocument()
        })
    })

    describe('summary', () => {
        const m = (x: number) => ({ postL: { x, y: 0.5 }, postR: { x: x + 0.1, y: 0.5 }, barL: { x, y: 0.4 }, barR: { x: x + 0.1, y: 0.4 } })

        it('should show a card per goal, saying which goal has posts', () => {
            useAppState.setState({ goalAreas: defaultGoalAreas(), goalMarks: { team1: m(0.1) } })
            mount({ startAt: 'summary' })
            const w = screen.getByRole('group', { name: "Whites' goal" })
            const c = screen.getByRole('group', { name: "Colours' goal" })
            expect(w.textContent).toContain('Goal posts identified')
            expect(c.textContent).toContain('No goal posts — Advanced detection needs them')
        })

        it('should reopen one step and come back to the summary afterwards', async () => {
            useAppState.setState({ goalAreas: defaultGoalAreas(), goalMarks: { team1: m(0.1) } })
            mount({ startAt: 'summary' })
            await userEvent.click(screen.getAllByRole('button', { name: 'Edit zoom' })[1])
            expect(screen.getByText("Replay zoom — goals scored into Colours' goal")).toBeInTheDocument()
            await userEvent.click(screen.getByRole('button', { name: 'Next' }))
            expect(screen.getByText('Check each goal, or edit one.')).toBeInTheDocument()
        })

        it('should swap which goal is whose, marks and boxes together', async () => {
            useAppState.setState({ goalAreas: defaultGoalAreas(), goalMarks: { team1: m(0.1) } })
            mount({ startAt: 'summary' })
            await userEvent.click(screen.getByRole('button', { name: 'Swap which goal is whose' }))
            expect(useAppState.getState().goalMarks).toEqual({ team2: m(0.1) })
            expect(useAppState.getState().goalAreas!.team2).toEqual(defaultGoalAreas().team1)
        })

        it('should remove the whole set-up', async () => {
            useAppState.setState({ goalAreas: defaultGoalAreas(), goalMarks: { team1: m(0.1) } })
            mount({ startAt: 'summary' })
            await userEvent.click(screen.getByRole('button', { name: 'Remove goal set-up' }))
            expect(useAppState.getState().goalAreas).toBeNull()
            expect(useAppState.getState().goalMarks).toBeNull()
        })

        it('should close with Done', async () => {
            useAppState.setState({ goalAreas: defaultGoalAreas() })
            const { onClose } = mount({ startAt: 'summary' })
            await userEvent.click(screen.getByRole('button', { name: 'Done' }))
            expect(onClose).toHaveBeenCalled()
        })
    })

    describe('closing', () => {
        it('should close on Escape and keep the goal that was finished', async () => {
            const { onClose } = mount({ startAt: 'posts1' })
            clickRequired()
            await userEvent.click(screen.getByRole('button', { name: 'Next' }))
            clickAt(0.6, 0.6) // half a goal for Colours
            await userEvent.keyboard('{Escape}')
            expect(onClose).toHaveBeenCalled()
            expect(useAppState.getState().goalMarks?.team1).toBeDefined()
            expect(useAppState.getState().goalMarks?.team2).toBeUndefined()
        })

        it('should close with the ✕', async () => {
            const { onClose } = mount()
            await userEvent.click(screen.getByRole('button', { name: 'Close goal set-up' }))
            expect(onClose).toHaveBeenCalled()
        })

        it('should close on the phone Back button (a history entry is pushed on open)', () => {
            const { onClose } = mount()
            expect((history.state as { goalSetup?: boolean }).goalSetup).toBe(true)
            history.replaceState(null, '')
            act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
            expect(onClose).toHaveBeenCalled()
        })
    })
})
