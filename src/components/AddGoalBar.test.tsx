// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { AddGoalBar } from './AddGoalBar'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 100 })

describe('AddGoalBar', () => {
    beforeEach(() => {
        useAppState.setState({ files: [vf('a.mp4')], events: [], currentFileIndex: 0, currentTimeInFileSec: 42.7, undoStack: [], redoStack: [] })
    })

    it('should not offer a manual time field', () => {
        render(<AddGoalBar />)
        expect(screen.queryByPlaceholderText('00:42')).not.toBeInTheDocument()
    })

    it('should add a goal at the current playback time', async () => {
        render(<AddGoalBar />)
        await userEvent.click(screen.getByRole('button', { name: /\+ goal/i }))
        expect(useAppState.getState().events[0]).toMatchObject({ matchTimeSec: 42, sourceFileIndex: 0, type: 'goal' })
    })
})
