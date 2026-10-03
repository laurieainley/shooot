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
            events: [{ id: 'a', matchTimeSec: 100, sourceFileIndex: 1, type: 'goal', team: 'Colours' }],
            teams: [{ name: 'Whites', color: '#3a6ea5', roster: [] }, { name: 'Colours', color: '#c2364a', roster: [] }],
            matchStartTimeSec: 100, currentFileIndex: 0, currentTimeInFileSec: 50,
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

    it('should draw file bands, the kick-off flag, event dots in team colour and the playhead', () => {
        render(<MatchStrip />)
        expect(screen.getByText('GX010226.MP4')).toBeInTheDocument()
        expect(screen.getByText('GX020226.MP4')).toBeInTheDocument()
        expect(screen.getByTitle('Kick-off')).toHaveStyle({ left: '10%' })
        const dot = screen.getByRole('button', { name: /Goal – Colours/ })
        expect(dot).toHaveStyle({ left: '70%', background: '#c2364a' })
        expect(track()).toHaveAttribute('aria-valuenow', '50')
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
