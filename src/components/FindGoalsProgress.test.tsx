// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useAppState } from '../state'

const job = vi.hoisted(() => ({ phase: 'running', fraction: 0.66, ballPhase: 'idle', ballFraction: 0, ballEp: null as string | null }))
vi.mock('../detectJobs', async (orig) => ({
    ...(await orig<typeof import('../detectJobs')>()),
    useDetectJob: (sel: (s: typeof job) => unknown) => sel(job),
    cancelDetection: vi.fn(),
}))
import { EventLog } from './EventLog'
import { OverflowMenu } from './OverflowMenu'

const vf = { id: 'a', name: 'a.mp4', url: '', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' } as never
beforeEach(() => {
    Object.assign(job, { phase: 'running', fraction: 0.66, ballPhase: 'idle', ballFraction: 0, ballEp: null })
    useAppState.setState({ files: [vf], cumulativeOffsets: [0], events: [], panel: null, picker: null, undoStack: [], redoStack: [] })
})

describe('Find goals progress outside the review panel', () => {
    it('should replace the empty state with the live line and an Open button', () => {
        render(<EventLog />)
        expect(screen.getByText('Listening for the roar… 66%')).toBeTruthy()
        expect(screen.queryByText(/No goals yet/)).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))
        expect(useAppState.getState().panel).toBe('review')
    })
    it('should show the ball phase lines', () => {
        Object.assign(job, { phase: 'done', ballPhase: 'running', ballFraction: 0.4, ballEp: 'webgpu' })
        render(<EventLog />)
        expect(screen.getByText('Checking the goal mouths… 40%')).toBeTruthy()
    })
    it('should sit above the event list when there are events', () => {
        useAppState.setState({ events: [{ id: 'g', matchTimeSec: 10, sourceFileIndex: 0, type: 'goal' }] })
        render(<EventLog />)
        expect(screen.getByText('Listening for the roar… 66%')).toBeTruthy()
        expect(screen.getByRole('listbox', { name: 'Event list' })).toBeTruthy()
    })
    it('should show nothing extra when idle', () => {
        job.phase = 'done'
        render(<EventLog />)
        expect(screen.queryByTestId('find-progress')).toBeNull()
        expect(screen.getByRole('button', { name: /Find goals/ })).toBeTruthy()
    })
    it('should show the percentage on the menu item while running', () => {
        render(<OverflowMenu />)
        fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
        expect(screen.getByRole('menuitem', { name: /Find goals — 66%/ })).toBeTruthy()
    })
})
