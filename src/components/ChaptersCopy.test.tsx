// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { ChaptersCopy } from './ChaptersCopy'

describe('ChaptersCopy', () => {
    beforeEach(() => {
        useAppState.setState({
            cumulativeOffsets: [0], matchStartTimeSec: 0, lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
            events: [{ id: 'a', matchTimeSec: 60, sourceFileIndex: 0, type: 'goal', team: 'Whites' }],
        })
    })

    it('should copy YouTube chapters to the clipboard and confirm', async () => {
        const writeText = vi.fn(() => Promise.resolve())
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        render(<ChaptersCopy />)
        await userEvent.click(screen.getByRole('button', { name: /youtube chapters/i }))
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('00:50 Goal 1-0 (Whites)'))
        expect(await screen.findByText(/copied/i)).toBeInTheDocument()
    })
})
