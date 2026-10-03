// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { GoalList } from './GoalList'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 100, kind: 'full' })

describe('GoalList', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')],
            events: [
                { id: 'linked', matchTimeSec: 10, sourceFileIndex: 0, sourceFileKey: 'a.mp4', type: 'goal' },
                { id: 'orphan', matchTimeSec: 20, sourceFileIndex: 1, sourceFileKey: 'gone.mp4', unlinked: true, type: 'goal' },
            ],
        })
    })

    it('should tag unlinked events as file missing and disable their seek button', () => {
        render(<GoalList />)
        expect(screen.getByText('V1')).toBeInTheDocument()
        expect(screen.getByText(/file missing/i)).toBeInTheDocument()
        const watch = screen.getAllByTitle(/watch goal|file not loaded/i)
        expect(watch[1]).toBeDisabled()
    })
})

describe('GoalList replay toggle', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')],
            events: [
                { id: 'g', matchTimeSec: 10, sourceFileIndex: 0, type: 'goal' },
                { id: 'h', matchTimeSec: 20, sourceFileIndex: 0, type: 'highlight' },
            ],
            undoStack: [], redoStack: [],
        })
    })

    it('should show a pressed Replay button for goals and an unpressed one otherwise', () => {
        render(<GoalList />)
        const [goal, highlight] = screen.getAllByRole('button', { name: 'Replay' })
        expect(goal).toHaveAttribute('aria-pressed', 'true')
        expect(highlight).toHaveAttribute('aria-pressed', 'false')
    })

    it('should flip the effective replay setting when clicked', async () => {
        render(<GoalList />)
        const [goal, highlight] = screen.getAllByRole('button', { name: 'Replay' })
        await userEvent.click(goal)
        await userEvent.click(highlight)
        const byId = (id: string) => useAppState.getState().events.find((e) => e.id === id)!
        expect(byId('g').replay).toBe(false)
        expect(byId('h').replay).toBe(true)
    })
})
