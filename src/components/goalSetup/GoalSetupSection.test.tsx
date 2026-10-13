// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../../state'
import { defaultGoalAreas } from '../../utils/crop'
import { GoalSetupSection } from './GoalSetupSection'

const useFrameAt = vi.hoisted(() => vi.fn())
const useStillAt = vi.hoisted(() => vi.fn())
vi.mock('../frameGrab', () => ({ useFrameAt, useStillAt, grabFrame: vi.fn().mockResolvedValue(null) }))
const READY = { status: 'ready', frame: { src: 'data:image/jpeg;base64,AA==', aspect: 16 / 9 } }
const file = { id: 'a', name: 'a.mp4', url: 'blob:a', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' as const }

describe('GoalSetupSection', () => {
    beforeEach(() => {
        useFrameAt.mockReset(); useFrameAt.mockReturnValue(READY)
        useStillAt.mockReset(); useStillAt.mockReturnValue(READY)
        useAppState.setState({ files: [file], goalAreas: null, goalMarks: null, teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#c00', roster: [] }] })
    })

    it('should grab the quick frame from the middle of the first file', () => {
        render(<GoalSetupSection />)
        expect(useFrameAt).toHaveBeenCalledWith('blob:a', 300)
    })

    it('should offer Set up goals first, and open the layer at the picture step', async () => {
        render(<GoalSetupSection />)
        expect(screen.queryByRole('dialog')).toBeNull()
        await userEvent.click(screen.getByRole('button', { name: 'Set up goals' }))
        expect(screen.getByRole('dialog', { name: 'Goal set-up' })).toBeInTheDocument()
        expect(screen.getByText('Choose the picture')).toBeInTheDocument()
    })

    it('should name each goal after the team that defends it, never "attacking"', () => {
        useAppState.setState({ goalAreas: defaultGoalAreas() })
        render(<GoalSetupSection />)
        expect(screen.getByRole('group', { name: "Whites' goal" })).toBeInTheDocument()
        expect(screen.getByRole('group', { name: "Colours' goal" })).toBeInTheDocument()
        expect(screen.getByText(/defends it at Kick off/)).toBeInTheDocument()
        expect(document.body.textContent).not.toMatch(/attacking/i)
    })

    it('should reopen the layer at just the zoom step of one goal, and close back to the summary', async () => {
        useAppState.setState({ goalAreas: defaultGoalAreas() })
        render(<GoalSetupSection />)
        await userEvent.click(screen.getAllByRole('button', { name: 'Edit zoom' })[0])
        expect(screen.getByText("Replay zoom — goals scored into Whites' goal")).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Next' }))
        expect(screen.getByText('Check each goal, or edit one.')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('should ask for a video when there is none', () => {
        useAppState.setState({ files: [] })
        render(<GoalSetupSection />)
        expect(screen.getByText('Load a video to set up the goals.')).toBeInTheDocument()
    })
})
