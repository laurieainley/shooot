// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { PreviewControls } from './PreviewControls'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full' })
const s = () => useAppState.getState()

describe('PreviewControls', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [], events: [], cumulativeOffsets: [], isPreviewMode: false, previewSegments: [], previewSteps: [], currentPreviewSegment: 0,
            adjustTimestampsByOffset: false, lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
            replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5, picker: null, panel: null, undoStack: [], redoStack: [],
        })
        s().setFiles([vf('a.mp4')])
        s().addEvents([{ id: 'g', matchTimeSec: 50, sourceFileIndex: 0, type: 'goal' }, { id: 'h', matchTimeSec: 200, sourceFileIndex: 0, type: 'highlight' }])
    })

    it('should start from clip 1 and show the replay as part of its clip', async () => {
        render(<PreviewControls />)
        await userEvent.click(screen.getByRole('button', { name: /preview in player/i }))
        expect(screen.getByRole('group', { name: 'Preview' })).toHaveTextContent('Clip 1 / 2')
        await userEvent.click(screen.getByRole('button', { name: 'Next' }))
        expect(screen.getByRole('group', { name: 'Preview' })).toHaveTextContent('Clip 1 / 2 · replay')
        await userEvent.click(screen.getByRole('button', { name: 'Next' }))
        expect(screen.getByRole('group', { name: 'Preview' })).toHaveTextContent('Clip 2 / 2')
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    })

    it('should exit with the Exit button', async () => {
        act(() => s().startPreview())
        render(<PreviewControls />)
        await userEvent.click(screen.getByRole('button', { name: 'Exit' }))
        expect(s().isPreviewMode).toBe(false)
    })

    it('should exit on Escape', async () => {
        act(() => s().startPreview())
        render(<PreviewControls />)
        await userEvent.keyboard('{Escape}')
        expect(s().isPreviewMode).toBe(false)
    })
})
