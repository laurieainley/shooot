// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { DescriptionCopy } from './DescriptionCopy'
import { resetTimelines, saveTimeline } from '../renderTimelines'
import { highlightsExport } from '../utils/exportPlans'

describe('DescriptionCopy', () => {
    let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>
    beforeEach(() => {
        writeText = vi.fn(() => Promise.resolve())
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        useAppState.setState({
            cumulativeOffsets: [0], lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, graphics: { cards: false, lowerThirds: true, replayTag: false, theme: 'shooot' },
            fullMatch: { cards: false, scoreBug: 'goals', intervalMin: 5, captions: false, replays: false },
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
        expect(writeText).toHaveBeenCalledWith('WH 1–0 CO\n\n00:00 Goal 1-0 (WH) Sam\n\nGoalscorers\nSam: 1')
        expect(await screen.findByText(/copied/i)).toBeInTheDocument()
    })

    it('should copy the full match description timed from kick-off', async () => {
        render(<DescriptionCopy kind="fullMatch" />)
        expect(screen.queryByRole('button', { name: /highlights description/i })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Copy full match description' }))
        expect(writeText).toHaveBeenCalledWith('WH 1–0 CO\n\n00:00 Kick off\n00:20 Goal 1-0 (WH) Sam\n\nGoalscorers\nSam: 1')
    })

    it('should say the times are estimates until a render of the same plan exists, then use its real times', async () => {
        resetTimelines()
        const { rerender } = render(<DescriptionCopy kind="highlights" />)
        expect(screen.getByText('Times are estimates until you render.')).toBeInTheDocument()
        const plan = highlightsExport(useAppState.getState(), 'full')
        act(() => saveTimeline('highlights', plan.signature, [{ outStartSec: 0, sourceStartSec: 49, outDurationSec: 16 }]))
        rerender(<DescriptionCopy kind="highlights" />)
        expect(screen.queryByText(/estimates/)).not.toBeInTheDocument()
        act(() => saveTimeline('highlights', 'another plan', [{ outStartSec: 0, sourceStartSec: 49, outDurationSec: 16 }]))
        expect(screen.getByText('Times are estimates until you render.')).toBeInTheDocument()
    })

    it('should copy the goalscorers', async () => {
        render(<DescriptionCopy kind="highlights" />)
        await userEvent.click(screen.getByRole('button', { name: 'Copy goalscorers' }))
        expect(writeText).toHaveBeenCalledWith('WH 1–0 CO\n\nSam: 1')
    })
})
