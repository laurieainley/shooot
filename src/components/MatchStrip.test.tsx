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
        const flag = container.querySelector('.strip-flag') as HTMLElement
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

    it('should name the event in the bubble only while hovering its exact symbol, at the event\'s time', () => {
        const { container } = render(<MatchStrip />)
        mockRect(track())
        const dot = container.querySelector('.strip-dot') as HTMLElement
        // The goal is 100 s into file 2 (700 s overall); the clock runs from kick-off (100 s): 10:00 in V2.
        fireEvent.pointerMove(dot.querySelector('svg') as Element, { clientX: 702, clientY: 20, pointerId: 1, pointerType: 'mouse' })
        expect(container.querySelector('.strip-bubble')?.textContent).toBe('Goal · 10:00 · V2')
        // Elsewhere on the track: just the time.
        fireEvent.pointerMove(track(), { clientX: 250, clientY: 20, pointerId: 1, pointerType: 'mouse' })
        expect(container.querySelector('.strip-bubble')?.textContent).toBe('02:30 · V1')
        expect(dot).not.toHaveAttribute('title')
    })

    it('should name a marker only on its flag icon, not on its hairline', () => {
        const { container } = render(<MatchStrip />)
        mockRect(track())
        const flag = container.querySelector('.strip-flag') as HTMLElement
        fireEvent.pointerMove(flag.querySelector('svg') as Element, { clientX: 100, clientY: 5, pointerId: 1, pointerType: 'mouse' })
        expect(container.querySelector('.strip-bubble')?.textContent).toBe('Kick off · 00:00 · V1')
        fireEvent.pointerMove(flag, { clientX: 100, clientY: 30, pointerId: 1, pointerType: 'mouse' })
        expect(container.querySelector('.strip-bubble')?.textContent).toBe('00:00 · V1')
        expect(flag).not.toHaveAttribute('title')
    })

    it('should call a suggestion ring a detected moment when hovering the ring itself', () => {
        useAppState.setState({ suggestionRun: null, suggestions: [
            { id: 's1', globalTimeSec: 300, score: 1, source: 'audio', status: 'pending' },
            { id: 's2', globalTimeSec: 500, score: 1, source: 'audio', status: 'pending', ball: { goal: 'team1', frames: 2 } },
        ] })
        const { container } = render(<MatchStrip />)
        mockRect(track())
        const bubble = (): string | null | undefined => container.querySelector('.strip-bubble')?.textContent
        fireEvent.pointerMove(track(), { clientX: 302, clientY: 36, pointerId: 1, pointerType: 'mouse' })
        expect(bubble()).toBe('Detected moment · 03:20 · V1')
        fireEvent.pointerMove(track(), { clientX: 500, clientY: 36, pointerId: 1, pointerType: 'mouse' })
        expect(bubble()).toBe('Detected moment (top pick) · 06:40 · V1')
        // Above the ring lane, or beside the ring: just the time.
        fireEvent.pointerMove(track(), { clientX: 300, clientY: 10, pointerId: 1, pointerType: 'mouse' })
        expect(bubble()).toBe('03:20 · V1')
        fireEvent.pointerMove(track(), { clientX: 320, clientY: 36, pointerId: 1, pointerType: 'mouse' })
        expect(bubble()).toBe('03:40 · V1')
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

    it('should draw a ring only for suggestions still to review, in their own lane, and a star for top picks', () => {
        useAppState.setState({ suggestionRun: null, suggestions: [
            { id: 's1', globalTimeSec: 120, score: 1, source: 'audio', status: 'pending' },
            { id: 's2', globalTimeSec: 240, score: 1, source: 'audio', status: 'pending', ball: { goal: 'team1', frames: 2 } },
            { id: 's3', globalTimeSec: 300, score: 1, source: 'audio', status: 'rejected' },
            { id: 's4', globalTimeSec: 360, score: 1, source: 'audio', status: 'kept', eventId: 'g1' },
        ], events: [{ id: 'g1', type: 'goal', matchTimeSec: 358, sourceFileIndex: 0 }] as never })
        render(<MatchStrip />)
        const rings = screen.getAllByRole('button', { name: /Detected moment/ })
        expect(rings).toHaveLength(2)
        expect(rings[0].className).toContain('strip-suggestion')
        expect(rings[0].className).not.toContain('strip-suggestion--top')
        expect(rings[1].className).toContain('strip-suggestion--top')
    })

    it('should show pending suggestions as rings that open the review', () => {
        useAppState.setState({ suggestions: [
            { id: 's1', globalTimeSec: 120, score: 1, source: 'audio', status: 'pending' },
            { id: 's2', globalTimeSec: 240, score: 1, source: 'audio', status: 'rejected' },
        ] })
        render(<MatchStrip />)
        const rings = screen.getAllByRole('button', { name: /Detected moment/ })
        expect(rings).toHaveLength(1)
        fireEvent.click(rings[0])
        expect(useAppState.getState().panel).toBe('review')
    })

    describe('suggestion rings and scrubbing', () => {
        beforeEach(() => {
            useAppState.setState({ panel: null, reviewIndex: 5, suggestionRun: null, suggestions: [{ id: 's1', globalTimeSec: 120, score: 1, source: 'audio', status: 'pending' }] })
        })
        it('should open the review on a touch tap within reach of a ring, without seeking', () => {
            render(<MatchStrip />)
            mockRect(track())
            fireEvent.pointerDown(track(), { clientX: 128, clientY: 30, pointerId: 1, pointerType: 'touch' })
            fireEvent.pointerUp(track(), { clientX: 129, clientY: 30, pointerId: 1, pointerType: 'touch' })
            expect(useAppState.getState().panel).toBe('review')
            expect(useAppState.getState().reviewIndex).toBe(0)
            expect(seekToGoal).not.toHaveBeenCalled()
        })
        it('should seek, not open the review, when a touch drag starts on a ring', () => {
            render(<MatchStrip />)
            mockRect(track())
            fireEvent.pointerDown(track(), { clientX: 120, clientY: 20, pointerId: 1, pointerType: 'touch' })
            fireEvent.pointerMove(track(), { clientX: 300, clientY: 20, pointerId: 1, pointerType: 'touch' })
            fireEvent.pointerUp(track(), { clientX: 300, clientY: 20, pointerId: 1, pointerType: 'touch' })
            expect(useAppState.getState().panel).toBeNull()
            expect(seekToGoal).toHaveBeenLastCalledWith(0, 300)
        })
        it('should seek on a touch tap far from any ring', () => {
            render(<MatchStrip />)
            mockRect(track())
            fireEvent.pointerDown(track(), { clientX: 400, clientY: 20, pointerId: 1, pointerType: 'touch' })
            fireEvent.pointerUp(track(), { clientX: 400, clientY: 20, pointerId: 1, pointerType: 'touch' })
            expect(useAppState.getState().panel).toBeNull()
            expect(seekToGoal).toHaveBeenLastCalledWith(0, 400)
        })
        it('should keep a 24 px touch target centred on the ring, and seek just beyond it', () => {
            render(<MatchStrip />)
            mockRect(track())
            fireEvent.pointerDown(track(), { clientX: 108, clientY: 30, pointerId: 1, pointerType: 'touch' })
            fireEvent.pointerUp(track(), { clientX: 108, clientY: 30, pointerId: 1, pointerType: 'touch' })
            expect(useAppState.getState().panel).toBe('review') // 12 px left of the ring
            useAppState.setState({ panel: null }); seekToGoal.mockClear()
            fireEvent.pointerDown(track(), { clientX: 140, clientY: 30, pointerId: 1, pointerType: 'touch' })
            fireEvent.pointerUp(track(), { clientX: 140, clientY: 30, pointerId: 1, pointerType: 'touch' })
            expect(useAppState.getState().panel).toBeNull()
            expect(seekToGoal).toHaveBeenLastCalledWith(0, 140)
        })
        it('should open the review only on a mouse click on the ring itself; near or above it the click just seeks', () => {
            render(<MatchStrip />)
            mockRect(track())
            const click = (x: number, y: number): void => {
                fireEvent.pointerDown(track(), { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' })
                fireEvent.pointerUp(track(), { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' })
            }
            click(130, 36) // 10 px beside the ring
            expect(useAppState.getState().panel).toBeNull()
            expect(seekToGoal).toHaveBeenLastCalledWith(0, 130)
            click(120, 5) // above the ring lane
            expect(useAppState.getState().panel).toBeNull()
            click(122, 36) // on the ring
            expect(useAppState.getState().panel).toBe('review')
            expect(useAppState.getState().reviewIndex).toBe(0)
        })
        it('should keep scrubbing with a mouse over a ring', () => {
            render(<MatchStrip />)
            mockRect(track())
            fireEvent.pointerDown(track(), { clientX: 120, clientY: 20, pointerId: 1, pointerType: 'mouse' })
            fireEvent.pointerMove(track(), { clientX: 300, clientY: 20, pointerId: 1, pointerType: 'mouse' })
            fireEvent.pointerUp(track(), { clientX: 300, clientY: 20, pointerId: 1, pointerType: 'mouse' })
            expect(seekToGoal).toHaveBeenLastCalledWith(0, 300)
            expect(useAppState.getState().panel).toBeNull()
        })
        it('should hide rings from a run on other videos', () => {
            useAppState.setState({ suggestionRun: { createdAt: 0, source: 'audio', configVersion: 2, analysedSec: 1, total: 1, fileKeys: ['other.mp4'] } })
            render(<MatchStrip />)
            expect(screen.queryByRole('button', { name: /Detected moment/ })).toBeNull()
        })
    })
})
