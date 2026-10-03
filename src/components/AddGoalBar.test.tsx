// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { AddGoalBar } from './AddGoalBar'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 100, kind: 'full' })

describe('AddGoalBar', () => {
    beforeEach(() => {
        useAppState.setState({ files: [vf('a.mp4')], events: [], currentFileIndex: 0, currentTimeInFileSec: 42.7, undoStack: [], redoStack: [] })
    })

    it('should not offer a manual time field', () => {
        render(<AddGoalBar />)
        expect(screen.queryByPlaceholderText('00:42')).not.toBeInTheDocument()
    })

    it('should mark an event at the current time and open the picker', async () => {
        render(<AddGoalBar />)
        await userEvent.click(screen.getByRole('button', { name: /\+ event/i }))
        const [e] = useAppState.getState().events
        expect(e).toMatchObject({ matchTimeSec: 42, sourceFileIndex: 0, type: 'goal' })
        expect(useAppState.getState().picker).toEqual({ eventId: e.id })
    })

    it('should not show team or scorer inputs', () => {
        render(<AddGoalBar />)
        expect(screen.queryByPlaceholderText('Team')).not.toBeInTheDocument()
    })
})
