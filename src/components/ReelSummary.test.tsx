// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { ReelSummary } from './ReelSummary'
import type { VideoSourceFile } from '../types'

const vf: VideoSourceFile = { id: 'a', name: 'a.mp4', url: '', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' }

describe('ReelSummary', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf], cumulativeOffsets: [0], adjustTimestampsByOffset: false,
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, replayBeforeSec: 3, replayAfterSec: 1, replaySpeed: 0.5,
            events: [
                { id: 'a', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' },
                { id: 'b', matchTimeSec: 300, sourceFileIndex: 0, type: 'highlight' },
            ],
        })
    })

    it('should show the reel length with the clip count', () => {
        render(<ReelSummary />)
        // 14 + 8 (replay) + 14 = 36 s
        expect(screen.getByLabelText('Reel summary')).toHaveTextContent('0:36 · 2 clips')
    })

    it('should use the singular for one clip', () => {
        useAppState.setState({ events: [{ id: 'h', matchTimeSec: 100, sourceFileIndex: 0, type: 'highlight' }] })
        render(<ReelSummary />)
        expect(screen.getByLabelText('Reel summary')).toHaveTextContent('0:14 · 1 clip')
    })

    it('should recap the clip and replay settings in one line', () => {
        render(<ReelSummary />)
        expect(screen.getByText(/Clips: 10 s before \/ 4 s after · Replays: 3 s → 1 s at 0.5×/)).toBeInTheDocument()
    })

    it('should keep the settings hidden until Edit is pressed, then edit them in place', async () => {
        render(<ReelSummary />)
        expect(screen.queryByLabelText('Replay before')).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
        expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-expanded', 'true')
        const before = screen.getByLabelText('Before')
        await userEvent.clear(before)
        await userEvent.type(before, '8')
        expect(useAppState.getState().lengthBeforeGoalSec).toBe(8)
        expect(screen.getByText(/Clips: 8 s before/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(screen.queryByLabelText('Replay before')).not.toBeInTheDocument()
    })
})
