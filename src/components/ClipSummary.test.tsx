// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAppState } from '../state'
import { ClipSummary } from './ClipSummary'
import type { VideoSourceFile } from '../types'

const vf: VideoSourceFile = { id: 'a', name: 'a.mp4', url: '', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' }

describe('ClipSummary', () => {
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

    it('should show clip padding, replay window and reel length with clip count', () => {
        render(<ClipSummary />)
        expect(screen.getByText('−10s / +4s')).toBeInTheDocument()
        expect(screen.getByText('−3s / +1s · 0.5×')).toBeInTheDocument()
        // 14 + 8 (replay) + 14 = 36 s
        expect(screen.getByText('0:36 · 2 clips')).toBeInTheDocument()
    })

    it('should use the singular for one clip', () => {
        useAppState.setState({ events: [{ id: 'h', matchTimeSec: 100, sourceFileIndex: 0, type: 'highlight' }] })
        render(<ClipSummary />)
        expect(screen.getByText('0:14 · 1 clip')).toBeInTheDocument()
    })

    it('should be read-only text, not a button (settings live in ⋯ → Advanced settings)', () => {
        render(<ClipSummary />)
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Clip summary')).toHaveTextContent('Clip−10s / +4s')
    })
})
