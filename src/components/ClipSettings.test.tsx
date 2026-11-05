// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { ClipSettings } from './ClipSettings'

describe('ClipSettings', () => {
    beforeEach(() => {
        useAppState.setState({ replayBeforeSec: 3, replayAfterSec: 1, replaySpeed: 0.5 })
    })

    it('should update the replay window from the Replay before / after inputs', () => {
        render(<ClipSettings />)
        fireEvent.change(screen.getByLabelText('Replay before'), { target: { value: '5' } })
        fireEvent.change(screen.getByLabelText('Replay after'), { target: { value: '2' } })
        const s = useAppState.getState()
        expect([s.replayBeforeSec, s.replayAfterSec]).toEqual([5, 2])
    })

    it('should update the replay speed from the Replay speed select', async () => {
        render(<ClipSettings />)
        await userEvent.selectOptions(screen.getByLabelText('Replay speed'), '0.25')
        expect(useAppState.getState().replaySpeed).toBe(0.25)
    })

    describe('Teaser row', () => {
        const base = { files: [{ id: 'a', name: 'a.mp4', url: '', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' as const }], cumulativeOffsets: [0], lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, highlightsTeaser: true }

        it('should say nothing is starred and hide the switch', () => {
            useAppState.setState({ ...base, events: [{ id: 'g', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' }] })
            render(<ClipSettings />)
            expect(screen.getByText('Teaser')).toBeInTheDocument()
            expect(screen.getByText('None starred: use ★ Star on an event')).toBeInTheDocument()
            expect(screen.queryByRole('switch', { name: 'Teaser' })).toBeNull()
        })

        it('should say starred moments are in files that are not loaded, with no switch', () => {
            useAppState.setState({ ...base, events: [{ id: 'g', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', marks: ['teaser'], unlinked: true }] })
            render(<ClipSettings />)
            expect(screen.getByText("Starred moments are in files that aren't loaded")).toBeInTheDocument()
            expect(screen.queryByText(/None starred/)).toBeNull()
            expect(screen.queryByRole('switch', { name: 'Teaser' })).toBeNull()
        })

        it('should show the moments and length with a switch', () => {
            useAppState.setState({ ...base, events: [
                { id: 'g', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', marks: ['teaser'] },
                { id: 'h', matchTimeSec: 300, sourceFileIndex: 0, type: 'highlight', marks: ['teaser'] },
            ] })
            render(<ClipSettings />)
            expect(screen.getByText('2 moments · 28 s')).toBeInTheDocument()
            expect(screen.getByRole('switch', { name: 'Teaser' })).toHaveAttribute('aria-checked', 'true')
        })

        it('should say "1 moment" for one star', () => {
            useAppState.setState({ ...base, events: [{ id: 'g', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', marks: ['teaser'] }] })
            render(<ClipSettings />)
            expect(screen.getByText('1 moment · 14 s')).toBeInTheDocument()
        })

        it('should leave the stars alone when the switch goes off', async () => {
            useAppState.setState({ ...base, events: [{ id: 'g', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', marks: ['teaser'] }] })
            render(<ClipSettings />)
            await userEvent.click(screen.getByRole('switch', { name: 'Teaser' }))
            expect(useAppState.getState().highlightsTeaser).toBe(false)
            expect(useAppState.getState().events[0].marks).toEqual(['teaser'])
            expect(screen.getByRole('switch', { name: 'Teaser' })).toHaveAttribute('aria-checked', 'false')
            expect(screen.getByText('1 moment · 14 s')).toBeInTheDocument()
        })
    })
})
