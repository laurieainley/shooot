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
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
            replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5, picker: null, panel: null, undoStack: [], redoStack: [],
        })
        s().setFiles([vf('a.mp4')])
        s().addEvents([{ id: 'g', matchTimeSec: 50, sourceFileIndex: 0, type: 'goal' }, { id: 'h', matchTimeSec: 200, sourceFileIndex: 0, type: 'highlight' }])
    })

    it('should start from clip 1, step clip by clip with a label that never changes width', async () => {
        render(<PreviewControls />)
        await userEvent.click(screen.getByRole('button', { name: /preview in player/i }))
        const group = screen.getByRole('group', { name: 'Preview' })
        const count = group.querySelector<HTMLElement>('.preview-controls__count')!
        const width = count.style.minWidth
        expect(group).toHaveTextContent('Clip 1 / 2')
        act(() => s().nextPreviewSegment()) // the replay plays as part of clip 1: no extra text
        expect(count.textContent).toBe('Clip 1 / 2')
        await userEvent.click(screen.getByRole('button', { name: 'Next clip' }))
        expect(count.textContent).toBe('Clip 2 / 2')
        expect(count.style.minWidth).toBe(width)
        expect(screen.getByRole('button', { name: 'Next clip' })).toBeDisabled()
        await userEvent.click(screen.getByRole('button', { name: 'Previous clip' }))
        expect(count.textContent).toBe('Clip 1 / 2')
    })

    it('should mark the clip\'s events in the list, as a replay while the replay plays', () => {
        const id = s().events.find((e) => !e.unlinked)!.id
        const row = document.createElement('li')
        row.dataset.eventId = id
        document.body.appendChild(row)
        act(() => s().startPreview())
        render(<PreviewControls />)
        expect(row.dataset.previewing).toBe('clip')
        act(() => s().nextPreviewSegment())
        expect(row.dataset.previewing).toBe('replay')
        act(() => s().exitPreview())
        expect(row.dataset.previewing).toBeUndefined()
        row.remove()
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
