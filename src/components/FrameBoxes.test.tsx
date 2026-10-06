// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { CropRect } from '../types'
import { FrameBoxes, type FrameBox } from './FrameBoxes'

const ready = { status: 'ready' as const, frame: { src: 'data:image/jpeg;base64,AA==', aspect: 16 / 9 } }
const box = (rect: CropRect): FrameBox => ({ id: 'left', label: 'Left goal', short: 'L', rect, tone: 'left' })

function setup(rect: CropRect = { x: 0.1, y: 0.2, w: 0.4, h: 0.4 }) {
    const onChange = vi.fn<(id: string, r: CropRect) => void>()
    const onCommit = vi.fn<(id: string) => void>()
    const { container } = render(<FrameBoxes state={ready} boxes={[box(rect)]} onChange={onChange} onCommit={onCommit} emptyText="none" />)
    // happy-dom has no layout: the picture is 1000 x 500 px.
    const area = container.querySelector('.frame-boxes') as HTMLElement
    area.getBoundingClientRect = () => ({ width: 1000, height: 500, left: 0, top: 0, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) })
    return { onChange, onCommit }
}
const last = (f: ReturnType<typeof vi.fn>): CropRect => f.mock.calls.at(-1)![1] as CropRect

describe('FrameBoxes', () => {
    it('should say why there is no picture', () => {
        render(<FrameBoxes state={{ status: 'idle', frame: null }} boxes={[]} onChange={() => {}} emptyText="Load a video." />)
        expect(screen.getByRole('status')).toHaveTextContent('Load a video.')
    })

    it('should move a box by dragging, as a fraction of the picture, and commit on release', () => {
        const { onChange, onCommit } = setup()
        const b = screen.getByRole('group', { name: 'Left goal box' })
        fireEvent.pointerDown(b, { pointerId: 1, clientX: 300, clientY: 200 })
        fireEvent.pointerMove(b, { pointerId: 1, clientX: 400, clientY: 250 })
        expect(last(onChange).x).toBeCloseTo(0.2)
        expect(last(onChange).y).toBeCloseTo(0.3)
        expect(onCommit).not.toHaveBeenCalled()
        fireEvent.pointerUp(b, { pointerId: 1 })
        expect(onCommit).toHaveBeenCalledWith('left')
    })

    it('should keep a dragged box inside the picture', () => {
        const { onChange } = setup()
        const b = screen.getByRole('group', { name: 'Left goal box' })
        fireEvent.pointerDown(b, { pointerId: 1, clientX: 300, clientY: 200 })
        fireEvent.pointerMove(b, { pointerId: 1, clientX: 5000, clientY: 5000 })
        expect(last(onChange).x).toBeCloseTo(0.6)
        expect(last(onChange).y).toBeCloseTo(0.6)
    })

    it('should resize from the corner handle with the aspect locked', () => {
        const { onChange } = setup()
        const h = screen.getByRole('button', { name: 'Resize Left goal box, bottom right' })
        fireEvent.pointerDown(h, { pointerId: 1, clientX: 500, clientY: 250 })
        fireEvent.pointerMove(h, { pointerId: 1, clientX: 600, clientY: 250 })
        expect(last(onChange).w).toBeCloseTo(0.5)
        expect(last(onChange).h).toBeCloseTo(0.5)
        expect(last(onChange).x).toBeCloseTo(0.1) // anchored at the top-left corner
    })

    it.each([
        ['top left', 100, 100, -100, -50, { x: 0, y: 0.1 }],
        ['top right', 500, 100, 100, -50, { x: 0.1, y: 0.1 }],
        ['bottom left', 100, 300, -100, 50, { x: 0, y: 0.2 }],
        ['bottom right', 500, 300, 100, 50, { x: 0.1, y: 0.2 }],
    ])('should resize from the %s handle with the opposite corner fixed', (corner, px, py, dx, dy, expected) => {
        const { onChange } = setup()
        const h = screen.getByRole('button', { name: `Resize Left goal box, ${corner}` })
        fireEvent.pointerDown(h, { pointerId: 1, clientX: px, clientY: py })
        fireEvent.pointerMove(h, { pointerId: 1, clientX: px + dx, clientY: py + dy })
        const r = last(onChange)
        expect(r.w).toBeCloseTo(0.5)
        expect(r.h).toBeCloseTo(0.5)
        expect(r.x).toBeCloseTo(expected.x)
        expect(r.y).toBeCloseTo(expected.y)
    })

    it('should draw the box that was last pressed above the other', () => {
        const rects = [{ x: 0.1, y: 0.2, w: 0.4, h: 0.4 }, { x: 0.3, y: 0.2, w: 0.4, h: 0.4 }]
        render(<FrameBoxes state={ready} boxes={[
            { id: 'left', label: 'Left goal', short: 'L', rect: rects[0], tone: 'left' },
            { id: 'right', label: 'Right goal', short: 'R', rect: rects[1], tone: 'right' },
        ]} onChange={() => {}} emptyText="none" />)
        const left = screen.getByRole('group', { name: 'Left goal box' })
        const right = screen.getByRole('group', { name: 'Right goal box' })
        const z = (e: HTMLElement): number => Number(e.style.zIndex || 0)
        fireEvent.pointerDown(right, { pointerId: 1, clientX: 600, clientY: 200 })
        expect(z(right)).toBeGreaterThan(z(left))
        fireEvent.pointerUp(right, { pointerId: 1 })
        fireEvent.pointerDown(left, { pointerId: 2, clientX: 200, clientY: 200 })
        expect(z(left)).toBeGreaterThan(z(right))
        fireEvent.pointerUp(left, { pointerId: 2 })
        fireEvent.focus(right)
        expect(z(right)).toBeGreaterThan(z(left))
    })

    it('should resize around the centre with a two-finger pinch', () => {
        const { onChange } = setup({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 })
        const b = screen.getByRole('group', { name: 'Left goal box' })
        fireEvent.pointerDown(b, { pointerId: 1, clientX: 400, clientY: 250 })
        fireEvent.pointerDown(b, { pointerId: 2, clientX: 500, clientY: 250 })
        fireEvent.pointerMove(b, { pointerId: 2, clientX: 600, clientY: 250 }) // fingers 100 -> 200 apart
        const r = last(onChange)
        expect(r.w).toBeCloseTo(0.8)
        expect(r.x + r.w / 2).toBeCloseTo(0.5)
    })

    it('should move and resize from the keyboard', () => {
        const { onChange, onCommit } = setup()
        const b = screen.getByRole('group', { name: 'Left goal box' })
        fireEvent.keyDown(b, { key: 'ArrowRight' })
        expect(last(onChange).x).toBeCloseTo(0.11)
        fireEvent.keyDown(b, { key: '+' })
        expect(last(onChange).w).toBeCloseTo(0.42)
        expect(onCommit).toHaveBeenCalledTimes(2)
    })

    it('should give the handle a 44 px target', () => {
        setup()
        // happy-dom does not run the stylesheet; assert the class that carries it.
        expect(screen.getByRole('button', { name: 'Resize Left goal box, bottom right' })).toHaveClass('frame-box__handle')
    })
})
