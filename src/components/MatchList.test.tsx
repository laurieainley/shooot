// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('idb-keyval', async () => (await import('../files/idbMock')).idbMock())
vi.mock('./matchSwitch', async (orig) => ({
    ...(await orig<typeof import('./matchSwitch')>()),
    openMatch: vi.fn(async () => true), startNewMatch: vi.fn(async () => undefined), switchBlocker: vi.fn(() => null), stopBlocker: vi.fn(),
}))

import * as idb from 'idb-keyval'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { putMatch } from '../files/matchStore'
import { toastStore } from '../toasts'
import { openMatchStore } from './openMatch'
import { railTabStore } from './railTab'
import { openMatch, startNewMatch, switchBlocker, stopBlocker } from './matchSwitch'
import { MatchList } from './MatchList'
import type { MatchRecord } from '../utils/matchRecord'

const reset = (idb as unknown as { __reset: () => void }).__reset
const rec = (id: string, updatedAt: number, title: string, score: [number, number] | null, fileCount = 2): MatchRecord => ({
    id, createdAt: 1, updatedAt, data: {} as never, files: [],
    summary: { title, teams: score ? ['A', 'B'] : null, score, dateMs: Date.UTC(2026, 9, 9, 12), fileCount, eventCount: 3 },
})

describe('MatchList', () => {
    beforeEach(() => {
        reset()
        openMatchStore.setState({ id: null, files: [], saveError: false })
        railTabStore.setState({ tab: 'matches' })
        toastStore.setState({ toast: null })
        vi.mocked(openMatch).mockClear().mockResolvedValue(true)
        vi.mocked(startNewMatch).mockClear()
        vi.mocked(switchBlocker).mockReturnValue(null)
        vi.mocked(stopBlocker).mockClear()
    })

    it('should show an empty state when nothing is saved', async () => {
        render(<MatchList />)
        expect(await screen.findByText(/no saved matches/i)).toBeInTheDocument()
    })

    it('should list matches newest first with title, score, meta and an Open tag on the open one', async () => {
        await putMatch(rec('m-old', 10, 'Old one', null, 0))
        await putMatch(rec('m-new', 20, 'Matchday 3', [13, 9]))
        openMatchStore.setState({ id: 'm-new' })
        render(<MatchList />)
        const rows = await screen.findAllByRole('listitem')
        expect(within(rows[0]).getByText('Matchday 3')).toBeInTheDocument()
        expect(within(rows[0]).getByText('13–9')).toBeInTheDocument()
        expect(within(rows[0]).getByText(/2 files/)).toBeInTheDocument()
        expect(within(rows[0]).getByText('Open')).toBeInTheDocument()
        expect(within(rows[1]).getByText(/no videos/)).toBeInTheDocument()
        expect(within(rows[1]).queryByText('Open')).not.toBeInTheDocument()
    })

    it('should open a match when its row is chosen', async () => {
        await putMatch(rec('m-a', 10, 'Alpha', null))
        render(<MatchList />)
        await userEvent.click(await screen.findByRole('button', { name: /^Alpha/ }))
        expect(openMatch).toHaveBeenCalledWith('m-a')
    })

    it('should start a new match from the header button', async () => {
        render(<MatchList />)
        await userEvent.click(await screen.findByRole('button', { name: '+ New match' }))
        expect(startNewMatch).toHaveBeenCalled()
    })

    it('should ask first when an export is running, and Cancel changes nothing', async () => {
        await putMatch(rec('m-a', 10, 'Alpha', null))
        vi.mocked(switchBlocker).mockReturnValue('render')
        render(<MatchList />)
        await userEvent.click(await screen.findByRole('button', { name: /^Alpha/ }))
        const dlg = screen.getByRole('alertdialog')
        expect(dlg).toHaveTextContent('Exporting — switching stops it.')
        await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }))
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
        expect(openMatch).not.toHaveBeenCalled()
        await userEvent.click(screen.getByRole('button', { name: /^Alpha/ }))
        await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Stop and switch' }))
        expect(stopBlocker).toHaveBeenCalled()
        await waitFor(() => expect(openMatch).toHaveBeenCalledWith('m-a'))
    })

    it('should delete from the row menu and show a toast', async () => {
        await putMatch(rec('m-a', 10, 'Alpha', null))
        render(<MatchList />)
        await userEvent.click(await screen.findByRole('button', { name: 'More for Alpha' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
        await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument())
        expect(toastStore.getState().toast?.text).toBe('Match deleted')
    })

    it('should show a broken row that can only be deleted', async () => {
        await idb.set('m-bad', { nonsense: true }, idb.createStore('shooot-matches', 'matches'))
        render(<MatchList />)
        expect(await screen.findByText(/couldn.t open this match/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    it('should show a row as broken when opening it fails', async () => {
        await putMatch(rec('m-a', 10, 'Alpha', null))
        vi.mocked(openMatch).mockResolvedValue(false)
        render(<MatchList />)
        await userEvent.click(await screen.findByRole('button', { name: /^Alpha/ }))
        expect(await screen.findByText(/couldn.t open this match/i)).toBeInTheDocument()
    })

    it('should say when the open match could not be saved', async () => {
        openMatchStore.setState({ saveError: true })
        render(<MatchList />)
        expect(await screen.findByText(/couldn.t save this match on this device/i)).toBeInTheDocument()
    })
})
