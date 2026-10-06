// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { encodeProject, buildTransferPayload } from '../utils/projectTransfer'
import { ReceiveProject } from './ReceiveProject'
import type { MatchEvent } from '../types'

const incoming: MatchEvent[] = [
    { id: 'n1', type: 'goal', matchTimeSec: 100, sourceFileIndex: 0, sourceFileKey: '010226', team: 'Colours', scorer: 'Sam' },
    { id: 'n2', type: 'highlight', matchTimeSec: 200, sourceFileIndex: 0, sourceFileKey: '010226' },
]
const old: MatchEvent[] = [{ id: 'o1', type: 'goal', matchTimeSec: 5, sourceFileIndex: 0, sourceFileKey: 'x' }]

async function setHash(): Promise<void> {
    const base = useAppState.getState()
    const data = await encodeProject(buildTransferPayload({
        ...base, events: incoming, matchdayLabel: 'Cup final',
        teams: [{ name: 'Reds', color: '#c00', roster: ['Sam'] }, { name: 'Blues', color: '#00c', roster: [] }],
    }))
    window.history.replaceState(null, '', `/#p=${data}`)
}

describe('ReceiveProject', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/')
        useAppState.setState({ files: [], events: [], undoStack: [], redoStack: [], matchdayLabel: null })
    })

    it('should load a link into an empty project without asking, and clear the fragment', async () => {
        await setHash()
        render(<ReceiveProject />)
        await waitFor(() => expect(useAppState.getState().events.map((e) => e.id)).toEqual(['n1', 'n2']))
        expect(useAppState.getState().matchdayLabel).toBe('Cup final')
        expect(useAppState.getState().teams[0].name).toBe('Reds')
        expect(window.location.hash).toBe('')
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('should ask before replacing a project that has events, and replace on confirm', async () => {
        useAppState.setState({ events: old })
        await setHash()
        render(<ReceiveProject />)
        expect(await screen.findByRole('alertdialog', { name: 'Replace project' })).toHaveTextContent('Replace current project with the received one?')
        expect(useAppState.getState().events).toEqual(old)
        await userEvent.click(screen.getByRole('button', { name: 'Replace' }))
        expect(useAppState.getState().events.map((e) => e.id)).toEqual(['n1', 'n2'])
        expect(window.location.hash).toBe('')
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('should keep the current project and clear the fragment on Keep current', async () => {
        useAppState.setState({ events: old })
        await setHash()
        render(<ReceiveProject />)
        await userEvent.click(await screen.findByRole('button', { name: 'Keep current' }))
        expect(useAppState.getState().events).toEqual(old)
        expect(window.location.hash).toBe('')
    })

    it('should report a damaged link and clear it', async () => {
        window.history.replaceState(null, '', '/#p=z1.AAAA')
        render(<ReceiveProject />)
        expect(await screen.findByRole('alert')).toHaveTextContent(/damaged/)
        expect(window.location.hash).toBe('')
    })

    it('should leave unrelated fragments alone', async () => {
        window.history.replaceState(null, '', '/#other')
        render(<ReceiveProject />)
        expect(window.location.hash).toBe('#other')
    })
})
