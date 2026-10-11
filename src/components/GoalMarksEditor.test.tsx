// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GoalMarks } from '../types'
import { setCoarsePointer } from '../test/pointer'
import { GoalMarksEditor } from './GoalMarksEditor'

const FRAME = { status: 'ready' as const, frame: { src: 'data:image/jpeg;base64,AA==', aspect: 16 / 9 } }
const FULL: GoalMarks = { postL: { x: 0.2, y: 0.6 }, postR: { x: 0.4, y: 0.6 }, barL: { x: 0.2, y: 0.4 }, barR: { x: 0.4, y: 0.4 } }

function mount(props: Partial<React.ComponentProps<typeof GoalMarksEditor>> = {}) {
    const onDone = vi.fn(), onCancel = vi.fn()
    render(<GoalMarksEditor team="team1" frame={FRAME} initial={null} onDone={onDone} onCancel={onCancel} {...props} />)
    const pic = screen.getByTestId('goal-marks-picture')
    // 1000 x 562.5 (16:9) picture at (100, 50)
    pic.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1000, height: 562.5, right: 1100, bottom: 612.5, x: 100, y: 50, toJSON: () => ({}) })
    return { pic, onDone, onCancel }
}
const clickAt = (el: Element, fx: number, fy: number): void => { fireEvent.click(el, { clientX: 100 + fx * 1000, clientY: 50 + fy * 562.5 }) }
function placeRequired(pic: Element): void {
    clickAt(pic, 0.2, 0.6); clickAt(pic, 0.4, 0.6); clickAt(pic, 0.2, 0.4); clickAt(pic, 0.4, 0.4)
}

describe('GoalMarksEditor', () => {
    beforeEach(() => setCoarsePointer(false))

    it('should prompt for the first step with a mouse and say Tap on touch', () => {
        mount()
        expect(screen.getByText('Click the bottom of the left post')).toBeInTheDocument()
    })

    it('should say Tap on touch screens', () => {
        setCoarsePointer(true)
        mount()
        expect(screen.getByText('Tap the bottom of the left post')).toBeInTheDocument()
    })

    it('should place a point at the clicked fraction and advance the prompt', () => {
        const { pic } = mount()
        clickAt(pic, 0.25, 0.5)
        expect(screen.getByRole('button', { name: 'Left post bottom' })).toHaveStyle({ left: '25%', top: '50%' })
        expect(screen.getByText('Click the bottom of the right post')).toBeInTheDocument()
    })

    it('should offer Skip for the optional points and then say all set', async () => {
        const { pic } = mount()
        expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument()
        placeRequired(pic)
        expect(screen.getByText('Click the back-left corner of the net on the floor (optional)')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
        expect(screen.getByText('Click the back-right corner of the net on the floor (optional)')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
        expect(screen.getByText('All set — drag a dot to adjust.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument()
    })

    it('should enable Done only with the four required points and report them without optional ones', async () => {
        const { pic, onDone } = mount()
        const doneBtn = screen.getByRole('button', { name: 'Done' })
        expect(doneBtn).toBeDisabled()
        clickAt(pic, 0.2, 0.6); clickAt(pic, 0.4, 0.6); clickAt(pic, 0.2, 0.4)
        expect(doneBtn).toBeDisabled()
        clickAt(pic, 0.4, 0.4)
        expect(doneBtn).toBeEnabled()
        await userEvent.click(doneBtn)
        expect(onDone).toHaveBeenCalledWith(FULL)
    })

    it('should include the back corners when both are placed', async () => {
        const { pic, onDone } = mount()
        placeRequired(pic)
        clickAt(pic, 0.15, 0.7); clickAt(pic, 0.45, 0.7)
        await userEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(onDone).toHaveBeenCalledWith({ ...FULL, backL: { x: 0.15, y: 0.7 }, backR: { x: 0.45, y: 0.7 } })
    })

    it('should drop a lone back corner on Done', async () => {
        const { pic, onDone } = mount()
        placeRequired(pic)
        clickAt(pic, 0.15, 0.7)
        await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
        await userEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(onDone).toHaveBeenCalledWith(FULL)
    })

    it('should only call onCancel on Cancel', async () => {
        const { pic, onDone, onCancel } = mount()
        clickAt(pic, 0.2, 0.6)
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(onCancel).toHaveBeenCalledTimes(1)
        expect(onDone).not.toHaveBeenCalled()
    })

    it('should drag a dot to a new place', () => {
        const { pic } = mount({ initial: FULL })
        const dot = screen.getByRole('button', { name: 'Left post bottom' })
        fireEvent.pointerDown(dot, { pointerId: 1, clientX: 300, clientY: 350 })
        fireEvent.pointerMove(dot, { pointerId: 1, clientX: 600, clientY: 331.25 })
        fireEvent.pointerUp(dot, { pointerId: 1, clientX: 600, clientY: 331.25 })
        expect(dot).toHaveStyle({ left: '50%', top: '50%' })
        expect(pic).toBeInTheDocument()
    })

    it('should nudge a focused dot with the arrow keys (Shift for bigger steps)', async () => {
        mount({ initial: FULL })
        const dot = screen.getByRole('button', { name: 'Right post top' })
        dot.focus()
        await userEvent.keyboard('{ArrowRight}')
        expect(dot.style.left).toBe('40.2%')
        await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
        expect(dot.style.top).toBe('41%')
    })

    it('should show initial marks with the all-set prompt and no Skip', () => {
        mount({ initial: FULL })
        expect(screen.getAllByRole('button').filter((b) => b.className.includes('goal-marks__dot'))).toHaveLength(4)
        expect(screen.getByText('All set — drag a dot to adjust.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled()
    })

    it('should draw the footprint only with back corners', () => {
        const { unmount } = render(<GoalMarksEditor team="team2" frame={FRAME} initial={FULL} onDone={vi.fn()} onCancel={vi.fn()} />)
        expect(document.querySelector('.goal-marks__foot')).toBeNull()
        unmount()
        render(<GoalMarksEditor team="team2" frame={FRAME} initial={{ ...FULL, backL: { x: 0.1, y: 0.8 }, backR: { x: 0.5, y: 0.8 } }} onDone={vi.fn()} onCancel={vi.fn()} />)
        expect(document.querySelector('.goal-marks__foot')).not.toBeNull()
        expect(document.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 1 1')
    })

    it('should zoom with the wheel and reset', async () => {
        const { pic } = mount()
        expect(pic.style.transform).toContain('scale(1)')
        fireEvent.wheel(screen.getByLabelText('Goal picture'), { deltaY: -30, clientX: 600, clientY: 300 })
        expect(pic.style.transform).not.toContain('scale(1)')
        await userEvent.click(screen.getByRole('button', { name: 'Reset zoom' }))
        expect(pic.style.transform).toContain('scale(1)')
    })

    it('should not swallow the next tap after a two-finger pinch', async () => {
        const { pic } = mount()
        const view = screen.getByLabelText('Goal picture')
        fireEvent.pointerDown(view, { pointerId: 1, clientX: 300, clientY: 300 })
        fireEvent.pointerDown(view, { pointerId: 2, clientX: 500, clientY: 300 })
        fireEvent.pointerMove(view, { pointerId: 2, clientX: 600, clientY: 300 })
        fireEvent.pointerUp(view, { pointerId: 2 })
        fireEvent.pointerUp(view, { pointerId: 1 })
        await new Promise((r) => setTimeout(r, 5))
        clickAt(pic, 0.25, 0.5)
        expect(screen.getByRole('button', { name: 'Left post bottom' })).toBeInTheDocument()
    })

    it('should keep dots at constant screen size when zoomed', () => {
        mount({ initial: FULL })
        fireEvent.wheel(screen.getByLabelText('Goal picture'), { deltaY: -200, clientX: 600, clientY: 300 })
        const zoom = Number(/scale\(([\d.]+)\)/.exec(screen.getByTestId('goal-marks-picture').style.transform)![1])
        expect(zoom).toBeGreaterThan(1)
        const s = Number(/scale\(([\d.]+)\)/.exec(screen.getByRole('button', { name: 'Left post bottom' }).style.transform)![1])
        expect(s).toBeCloseTo(1 / zoom, 3)
    })

    it('should measure fractions inside the letterboxed image (4:3 frame in a 16:9 box)', () => {
        const { pic } = mount({ frame: { status: 'ready', frame: { src: 'data:image/jpeg;base64,AA==', aspect: 4 / 3 } } })
        pic.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1000, height: 500, right: 1100, bottom: 550, x: 100, y: 50, toJSON: () => ({}) })
        // Box 1000x500 at (100,50): image is 666.67 wide, centred (left edge at 100 + 166.67).
        fireEvent.click(pic, { clientX: 100 + 500, clientY: 50 + 250 })
        const dot = screen.getByRole('button', { name: 'Left post bottom' })
        expect(parseFloat(dot.style.left)).toBeCloseTo(50, 1)
        fireEvent.click(pic, { clientX: 100 + 166.6667 + 666.6667 * 0.25, clientY: 50 + 125 })
        expect(parseFloat(screen.getByRole('button', { name: 'Right post bottom' }).style.left)).toBeCloseTo(25, 1)
    })
})
