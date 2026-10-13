// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { cancelDetection } from '../detectJobs'
import { renderJobs } from '../renderJobs'
import { OverflowMenu } from './OverflowMenu'
import type { MatchEvent, VideoSourceFile } from '../types'

vi.mock('../detectJobs', async (orig) => ({ ...(await orig<typeof import('../detectJobs')>()), cancelDetection: vi.fn() }))

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full' })
const two: MatchEvent[] = [
    { id: 'a', matchTimeSec: 10, sourceFileIndex: 0, type: 'goal' },
    { id: 'b', matchTimeSec: 20, sourceFileIndex: 0, type: 'highlight' },
]
const s = () => useAppState.getState()

describe('OverflowMenu', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')], cumulativeOffsets: [0], events: two, picker: null, panel: null,
            currentFileIndex: 0, undoStack: [], redoStack: [],
        })
    })

    const open = async (): Promise<void> => { await userEvent.click(screen.getByRole('button', { name: 'Menu' })) }

    it('should hold every secondary action in one menu', async () => {
        render(<OverflowMenu />)
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
        await open()
        const items = screen.getAllByRole('menuitem').map((b) => b.textContent)
        expect(items).toEqual(['New match…', 'Find goals AI — Finds likely goals with AI on this device — check each one', 'Advanced settings', 'Send project to another device', 'Import…', 'Export project', 'Shortcuts'])
    })

    it('should offer Find goals (Beta), or Review moments once there are some', async () => {
        useAppState.setState({ suggestions: [] })
        const { unmount } = render(<OverflowMenu />)
        await open()
        expect(screen.getByRole('menuitem', { name: /Find goals/ })).toHaveTextContent("AI")
        unmount()
        useAppState.setState({ suggestions: [{ id: 's', globalTimeSec: 5, score: 1, source: 'audio', status: 'pending' }], panel: null })
        render(<OverflowMenu />)
        await open()
        expect(screen.getByRole('menuitem', { name: /Review moments/ })).toHaveTextContent("AI")
        useAppState.setState({ suggestions: [] })
    })

    it('should offer Find goals again when the videos changed since the last run', async () => {
        useAppState.setState({
            suggestions: [{ id: 's', globalTimeSec: 5, score: 1, source: 'audio', status: 'pending' }],
            suggestionRun: { createdAt: 0, source: 'audio', configVersion: 2, analysedSec: 600, total: 1, fileKeys: ['other.mp4'] },
        })
        render(<OverflowMenu />)
        await open()
        expect(screen.getByRole('menuitem', { name: /Find goals/ })).toBeInTheDocument()
        expect(screen.queryByRole('menuitem', { name: /Review moments/ })).not.toBeInTheDocument()
        useAppState.setState({ suggestions: [], suggestionRun: null })
    })

    it('should cancel a running Find goals when a new match starts', async () => {
        render(<OverflowMenu />)
        await open()
        await userEvent.click(screen.getByRole('menuitem', { name: 'New match…' }))
        await vi.waitFor(() => expect(cancelDetection).toHaveBeenCalled())
    })

    it('should open the stepped New match setup after clearing', async () => {
        render(<OverflowMenu />)
        await open()
        await userEvent.click(screen.getByRole('menuitem', { name: 'New match…' }))
        await vi.waitFor(() => expect(s().panel).toBe('newmatch'))
        expect(s().files).toEqual([])
    })

    it('should keep Match setup in the menu on the phone, where the bar has no room for it', async () => {
        render(<OverflowMenu layout="phone" />)
        await open()
        expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toContain('Match setup')
        await userEvent.click(screen.getByRole('menuitem', { name: 'Match setup' }))
        expect(s().panel).toBe('match')
    })

    it('should open the Shortcuts sheet from the menu', async () => {
        render(<OverflowMenu />)
        await open()
        await userEvent.click(screen.getByRole('menuitem', { name: 'Shortcuts' }))
        expect(s().panel).toBe('shortcuts')
    })

    it.each([['Advanced settings', 'settings'], ['Import…', 'import']] as const)(
        'should open %s as its own panel', async (item, panel) => {
            render(<OverflowMenu />)
            await open()
            await userEvent.click(screen.getByRole('menuitem', { name: item }))
            expect(s().panel).toBe(panel)
            expect(screen.queryByRole('menu')).not.toBeInTheDocument()
        })

    it('should close the event picker (keeping the event) when opened', async () => {
        s().markEvent(30)
        render(<OverflowMenu />)
        await open()
        expect(s().picker).toBeNull()
        expect(s().events).toHaveLength(3)
    })

    it('should start a new match straight away, without a confirm', async () => {
        render(<OverflowMenu />)
        await open()
        await userEvent.click(screen.getByRole('menuitem', { name: /new match/i }))
        await vi.waitFor(() => expect(s().events).toEqual([]))
        expect(screen.queryByRole('button', { name: /clear match/i })).not.toBeInTheDocument()
        expect(s().files).toEqual([])
        expect(s().panel).toBe('newmatch') // the stepped New match setup opens
    })

    it('should ask first when an export is running, and keep everything on Cancel', async () => {
        renderJobs().setState({ job: { phase: 'running' } as never })
        try {
            render(<OverflowMenu />)
            await open()
            await userEvent.click(screen.getByRole('menuitem', { name: /new match/i }))
            expect(screen.getByText('Exporting — switching stops it.')).toBeInTheDocument()
            await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
            expect(s().events).toHaveLength(2)
            expect(screen.queryByText('Exporting — switching stops it.')).not.toBeInTheDocument()
        } finally { renderJobs().setState({ job: null }) }
    })

    it('should not show a Labs item while labs is off', async () => {
        useAppState.setState({ labs: false, labsSeen: false, panel: null })
        render(<OverflowMenu />)
        await open()
        expect(screen.queryByRole('menuitem', { name: /Labs/ })).not.toBeInTheDocument()
    })

    it('should show "Labs: on" while labs is on and turn it off when clicked', async () => {
        useAppState.setState({ labs: true, panel: null })
        render(<OverflowMenu />)
        await open()
        await userEvent.click(screen.getByRole('menuitem', { name: 'Labs: on' }))
        expect(useAppState.getState().labs).toBe(false)
    })

    it('should keep a "Labs: off" toggle once Labs has been on, and switch it back on', async () => {
        useAppState.setState({ labs: false, labsSeen: false, panel: null })
        useAppState.getState().setLabs(true)
        useAppState.getState().setLabs(false)
        render(<OverflowMenu />)
        await open()
        await userEvent.click(screen.getByRole('menuitem', { name: 'Labs: off' }))
        expect(useAppState.getState().labs).toBe(true)
    })
})

describe('OverflowMenu send project', () => {
    it('should open the send sheet from the menu', async () => {
        useAppState.setState({ files: [], events: two, panel: null })
        render(<OverflowMenu />)
        await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Send project to another device' }))
        expect(useAppState.getState().panel).toBe('send')
    })
})
