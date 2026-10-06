// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { DescriptionCopy } from './DescriptionCopy'

describe('DescriptionCopy', () => {
    let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>
    beforeEach(() => {
        writeText = vi.fn(() => Promise.resolve())
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        useAppState.setState({
            cumulativeOffsets: [0], lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, graphics: { cards: false, lowerThirds: true, replayTag: false },
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
            events: [
                { id: 'k', matchTimeSec: 30, sourceFileIndex: 0, type: 'kick_off' },
                { id: 'a', matchTimeSec: 60, sourceFileIndex: 0, type: 'goal', team: 'Whites', scorer: 'Sam' },
            ],
        })
    })

    it('should copy the highlights description and confirm', async () => {
        render(<DescriptionCopy kind="highlights" />)
        await userEvent.click(screen.getByRole('button', { name: 'Copy highlights description' }))
        expect(writeText).toHaveBeenCalledWith('Whites 1–0 Colours\n\n00:00 Goal 1-0 (Whites) Sam\n\nGoalscorers\nSam: 1 (\'1)')
        expect(await screen.findByText(/copied/i)).toBeInTheDocument()
    })

    it('should copy the full match description timed from kick-off', async () => {
        render(<DescriptionCopy kind="fullMatch" />)
        expect(screen.queryByRole('button', { name: /highlights description/i })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Copy full match description' }))
        expect(writeText).toHaveBeenCalledWith('Whites 1–0 Colours\n\n00:00 Kick off\n00:20 Goal 1-0 (Whites) Sam\n\nGoalscorers\nSam: 1 (\'1)')
    })

    it('should copy the goalscorers', async () => {
        render(<DescriptionCopy kind="highlights" />)
        await userEvent.click(screen.getByRole('button', { name: 'Copy goalscorers' }))
        expect(writeText).toHaveBeenCalledWith('Whites 1–0 Colours\n\nSam: 1 (\'1)')
    })
})
