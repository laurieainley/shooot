// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useAppState } from '../state'
import { MatchStrip } from './MatchStrip'
import type { VideoSourceFile } from '../types'

const vf = (name: string, durationSec: number): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec, kind: 'full' })

let seekToGoal: ReturnType<typeof vi.fn<(fileIndex: number, timeSec: number) => void>>

describe('MatchStrip', () => {
    beforeEach(() => {
        seekToGoal = vi.fn()
        useAppState.setState({
            files: [vf('GX010226.MP4', 600), vf('GX020226.MP4', 400)],
            cumulativeOffsets: [0, 600],
            events: [{ id: 'k', matchTimeSec: 100, sourceFileIndex: 0, type: 'kick_off' }, { id: 'a', matchTimeSec: 100, sourceFileIndex: 1, type: 'goal', team: 'Colours' }],
            teams: [{ name: 'Whites', color: '#3a6ea5', roster: [] }, { name: 'Colours', color: '#c2364a', roster: [] }],
            currentFileIndex: 0, currentTimeInFileSec: 50,
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, isPreviewMode: false, seekToGoal,
        })
    })

    const track = (): HTMLElement => screen.getByRole('slider', { name: 'Match timeline' })
    const mockRect = (el: HTMLElement): void => {
        el.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 40, right: 1000, bottom: 40, x: 0, y: 0, toJSON: () => ({}) })
    }

    it('should seek to the right file and time when the track is clicked', () => {
        render(<MatchStrip />)
        mockRect(track())
        fireEvent.pointerDown(track(), { clientX: 700, pointerId: 1 })
        expect(seekToGoal).toHaveBeenCalledWith(1, 100)
        fireEvent.pointerDown(track(), { clientX: 250, pointerId: 1 })
        expect(seekToGoal).toHaveBeenLastCalledWith(0, 250)
    })

    it('should draw numbered file bands, the kick-off flag, a goal icon (not the kit colour) and the playhead', () => {
        const { container } = render(<MatchStrip />)
        expect(screen.getByTitle('GX010226.MP4')).toHaveStyle({ left: '0%' })
        expect(screen.getByTitle('GX020226.MP4')).toHaveStyle({ left: '60%' })
        expect(container.querySelectorAll('.strip-file__num')).toHaveLength(2)
        const flag = screen.getByTitle(/^Kick off/)
        expect(flag).toHaveStyle({ left: '10%' })
        expect(flag.querySelector('[data-icon="kick_off"]')).not.toBeNull()
        const dot = screen.getByRole('button', { name: /Goal – Colours/ })
        expect(dot).toHaveStyle({ left: '70%' })
        expect(dot.querySelector('[data-icon="goal"]')).toHaveClass('ev-icon--goal')
        expect(container.querySelector('.strip-head')).toHaveStyle({ left: '5%' })
        expect(track()).toHaveAttribute('aria-valuenow', '50')
    })

    it('should be a keyboard-focusable slider (arrow keys are the global seek shortcuts)', () => {
        render(<MatchStrip />)
        expect(track()).toHaveAttribute('tabindex', '0')
    })

    it('should show the time under the pointer in a bubble on hover, and hide it on leave', () => {
        render(<MatchStrip />)
        mockRect(track())
        fireEvent.pointerMove(track(), { clientX: 250, pointerId: 1, pointerType: 'mouse' })
        // 25% of 1000 s = 250 s into file 1; the match clock starts at kick-off (100 s): 02:30
        expect(screen.getByText('02:30')).toBeInTheDocument()
        expect(screen.getByText(/V1/, { selector: '.strip-bubble__file' })).toBeInTheDocument()
        fireEvent.pointerLeave(track(), { pointerType: 'mouse' })
        expect(screen.queryByText('02:30')).not.toBeInTheDocument()
    })

    it('should stack icons that would overlap so every event stays visible', () => {
        useAppState.setState({
            events: [
                { id: 'a', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' },
                { id: 'b', matchTimeSec: 101, sourceFileIndex: 0, type: 'save' },
                { id: 'c', matchTimeSec: 102, sourceFileIndex: 0, type: 'foul' },
            ],
        })
        const { container } = render(<MatchStrip />)
        const lanes = Array.from(container.querySelectorAll('.strip-dot')).map((d) => d.getAttribute('data-lane'))
        expect(lanes).toEqual(['0', '1', '2'])
    })

    it('should seek to the clip start when an event dot is clicked', () => {
        render(<MatchStrip />)
        fireEvent.click(screen.getByRole('button', { name: /Goal – Colours/ }))
        expect(seekToGoal).toHaveBeenCalledWith(1, 90)
    })

    it('should show the current match clock and file in its label', () => {
        useAppState.setState({ currentFileIndex: 1, currentTimeInFileSec: 100 })
        render(<MatchStrip />)
        expect(screen.getByText('10:00')).toBeInTheDocument()
        expect(screen.getByText('V2/2')).toBeInTheDocument()
    })

    it('should render nothing interactive before any file has a duration', () => {
        useAppState.setState({ files: [], cumulativeOffsets: [] })
        render(<MatchStrip />)
        expect(screen.queryByRole('slider', { name: 'Match timeline' })).not.toBeInTheDocument()
    })
})
