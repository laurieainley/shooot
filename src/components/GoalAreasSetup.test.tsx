// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { defaultGoalAreas } from '../utils/crop'
import { GoalAreasSetup } from './GoalAreasSetup'

const useFrameAt = vi.hoisted(() => vi.fn())
vi.mock('./frameGrab', () => ({ useFrameAt }))
const READY = { status: 'ready', frame: { src: 'data:image/jpeg;base64,AA==', aspect: 16 / 9 } }
const file = { id: 'a', name: 'a.mp4', url: 'blob:a', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' as const }

describe('GoalAreasSetup', () => {
    beforeEach(() => {
        useFrameAt.mockReset()
        useFrameAt.mockReturnValue(READY)
        useAppState.setState({ files: [file], goalAreas: null, teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#c00', roster: [] }] })
    })

    it('should grab the frame from the middle of the first file', () => {
        render(<GoalAreasSetup />)
        expect(useFrameAt).toHaveBeenCalledWith('blob:a', 300)
    })

    it('should offer to set the goal areas and then show a box for each goal', async () => {
        render(<GoalAreasSetup />)
        expect(screen.queryByRole('group', { name: "Whites' goal box" })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Set goal areas' }))
        expect(useAppState.getState().goalAreas).toEqual(defaultGoalAreas())
        expect(screen.getByRole('group', { name: "Whites' goal box" })).toBeInTheDocument()
        expect(screen.getByRole('group', { name: "Colours' goal box" })).toBeInTheDocument()
    })

    it('should store a moved box', async () => {
        useAppState.setState({ goalAreas: defaultGoalAreas() })
        render(<GoalAreasSetup />)
        const left = screen.getByRole('group', { name: "Whites' goal box" })
        left.focus()
        await userEvent.keyboard('{ArrowDown}')
        expect(useAppState.getState().goalAreas!.team1!.y).toBeCloseTo(defaultGoalAreas().team1!.y + 0.01)
        expect(useAppState.getState().goalAreas!.team2).toEqual(defaultGoalAreas().team2)
    })

    it('should warn about a box under 35 % of the frame width', () => {
        useAppState.setState({ goalAreas: { team1: { x: 0.1, y: 0.2, w: 0.3, h: 0.3 }, team2: defaultGoalAreas().team2 } })
        render(<GoalAreasSetup />)
        expect(screen.getByText(/look soft/)).toBeInTheDocument()
    })

    it('should not warn for the default boxes', () => {
        useAppState.setState({ goalAreas: defaultGoalAreas() })
        render(<GoalAreasSetup />)
        expect(screen.queryByText(/look soft/)).not.toBeInTheDocument()
    })

    it('should reset and remove the boxes', async () => {
        useAppState.setState({ goalAreas: { team1: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 }, team2: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } } })
        render(<GoalAreasSetup />)
        await userEvent.click(screen.getByRole('button', { name: 'Reset boxes' }))
        expect(useAppState.getState().goalAreas).toEqual(defaultGoalAreas())
        await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
        expect(useAppState.getState().goalAreas).toBeNull()
    })

    it('should swap which goal is whose', async () => {
        useAppState.setState({ goalAreas: defaultGoalAreas() })
        render(<GoalAreasSetup />)
        await userEvent.click(screen.getByRole('button', { name: 'Swap which goal is whose' }))
        expect(useAppState.getState().goalAreas).toEqual({ team1: defaultGoalAreas().team2, team2: defaultGoalAreas().team1 })
    })

    it('should offer no swap before the boxes are set', () => {
        render(<GoalAreasSetup />)
        expect(screen.queryByRole('button', { name: 'Swap which goal is whose' })).not.toBeInTheDocument()
    })

    it('should name the boxes Team 1 / Team 2 without team names', async () => {
        useAppState.setState({ goalAreas: defaultGoalAreas(), teams: [{ name: '', color: '#fff', roster: [] }, { name: '', color: '#c00', roster: [] }] })
        render(<GoalAreasSetup />)
        expect(screen.getByRole('group', { name: "Team 1's goal box" })).toBeInTheDocument()
        expect(screen.getByRole('group', { name: "Team 2's goal box" })).toBeInTheDocument()
    })

    it('should not talk about left or right', () => {
        useAppState.setState({ goalAreas: defaultGoalAreas() })
        render(<GoalAreasSetup />)
        expect(screen.queryByText(/second Kick off|attack \(first half\)/)).not.toBeInTheDocument()
    })

    it('should say what is missing without a video', () => {
        useAppState.setState({ files: [] })
        useFrameAt.mockReturnValue({ status: 'idle', frame: null })
        render(<GoalAreasSetup />)
        expect(screen.getByText('Load a video to set the goal areas.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Set goal areas' })).toBeDisabled()
    })
})
