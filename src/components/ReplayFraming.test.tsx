// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { MatchEvent } from '../types'
import { defaultGoalAreas } from '../utils/crop'
import { EventSheet } from './EventSheet'

const useFrameAt = vi.hoisted(() => vi.fn())
vi.mock('./frameGrab', () => ({ useFrameAt }))
const READY = { status: 'ready', frame: { src: 'data:image/jpeg;base64,AA==', aspect: 16 / 9 } }
const file = { id: 'a', name: 'a.mp4', url: 'blob:a', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' as const }
const teams = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#c00', roster: [] }]
const ev = (): MatchEvent => useAppState.getState().events.find((e) => e.id === 'a')!

function setup(event: Partial<MatchEvent> = {}, areas = true): void {
    useFrameAt.mockReset()
    useFrameAt.mockReturnValue(READY)
    useAppState.setState({
        files: [file], cumulativeOffsets: [0], teams, goalAreas: areas ? defaultGoalAreas() : null,
        events: [{ id: 'a', matchTimeSec: 95, sourceFileIndex: 0, type: 'goal', team: 'Whites', ...event }],
        undoStack: [], redoStack: [], picker: null, panel: 'event', editingEventId: 'a',
    })
    render(<EventSheet />)
}
const framing = (): HTMLElement => screen.getByRole('group', { name: 'Replay framing' })
const choice = (name: string): HTMLElement => screen.getByRole('button', { name })

describe('Replay framing', () => {
    it('should appear only while the replay is on', () => {
        setup({ replay: false })
        expect(screen.queryByRole('group', { name: 'Replay framing' })).not.toBeInTheDocument()
    })

    it('should default to Auto, framed on the goal the scoring team attacks', () => {
        setup()
        expect(choice('Auto')).toHaveAttribute('aria-pressed', 'true')
        // Whites score at the goal Colours defend: Colours' goal
        const box = screen.getByRole('group', { name: 'Replay framing box' })
        expect(box.style.left).toBe(`${defaultGoalAreas().team2!.x * 100}%`)
    })

    it('should store either team\'s goal and Full frame, and Auto clears the choice', async () => {
        setup()
        await userEvent.click(choice("Colours' goal"))
        expect(ev().replayCrop).toBe('team2')
        await userEvent.click(choice('Full frame'))
        expect(ev().replayCrop).toBe('full')
        expect(screen.queryByRole('group', { name: 'Replay framing box' })).not.toBeInTheDocument()
        await userEvent.click(choice('Auto'))
        expect(ev().replayCrop).toBeUndefined()
    })

    it('should disable the team goals without goal areas and say where to set them', () => {
        setup({}, false)
        expect(choice("Whites' goal")).toBeDisabled()
        expect(choice("Colours' goal")).toBeDisabled()
        expect(choice('Custom')).toBeEnabled()
        expect(screen.getByText(/Mark the goals in Match setup/)).toBeInTheDocument()
    })

    it('should make Custom from the current framing', async () => {
        setup()
        await userEvent.click(choice('Custom'))
        expect(ev().replayCrop).toEqual(defaultGoalAreas().team2!)
    })

    it('should turn a dragged box into a custom crop in one undo step', () => {
        setup({ team: 'Colours' })
        const box = screen.getByRole('group', { name: 'Replay framing box' })
        const area = box.parentElement!
        area.getBoundingClientRect = () => ({ width: 1000, height: 500, left: 0, top: 0, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) })
        fireEvent.pointerDown(box, { pointerId: 1, clientX: 200, clientY: 200 })
        fireEvent.pointerMove(box, { pointerId: 1, clientX: 250, clientY: 200 })
        fireEvent.pointerMove(box, { pointerId: 1, clientX: 300, clientY: 200 })
        expect(ev().replayCrop).toBeUndefined() // still a draft
        fireEvent.pointerUp(box, { pointerId: 1 })
        const crop = ev().replayCrop as { x: number; w: number }
        expect(crop.x).toBeCloseTo(defaultGoalAreas().team1!.x + 0.1)
        expect(crop.w).toBeCloseTo(0.4)
        expect(useAppState.getState().undoStack).toHaveLength(1)
        expect(choice('Custom')).toHaveAttribute('aria-pressed', 'true')
    })

    it('should zoom around the centre of the box with the slider (1x to 3x)', () => {
        const before = { x: 0.3, y: 0.25, w: 0.4, h: 0.4 }
        setup({ replayCrop: before })
        const slider = screen.getByRole('slider', { name: 'Replay zoom' }) as HTMLInputElement
        expect(slider.min).toBe('1')
        expect(slider.max).toBe('3')
        expect(slider.value).toBe('2.5')
        fireEvent.change(slider, { target: { value: '2' } })
        fireEvent.pointerUp(slider)
        const crop = ev().replayCrop as { x: number; y: number; w: number }
        expect(crop.w).toBeCloseTo(0.5)
        expect(crop.x + crop.w / 2).toBeCloseTo(before.x + before.w / 2)
        expect(crop.y + crop.w / 2).toBeCloseTo(before.y + before.h / 2)
    })

    it('should store the whole frame at 1x', () => {
        setup()
        const slider = screen.getByRole('slider', { name: 'Replay zoom' })
        fireEvent.change(slider, { target: { value: '1' } })
        fireEvent.pointerUp(slider)
        expect(ev().replayCrop).toBe('full')
    })

    it('should warn when the crop is narrower than 35 % of the frame', () => {
        setup()
        expect(screen.queryByText(/look soft/)).not.toBeInTheDocument()
        const slider = screen.getByRole('slider', { name: 'Replay zoom' })
        fireEvent.change(slider, { target: { value: '3' } })
        expect(framing()).toHaveTextContent(/look soft/)
    })
})
