// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { selectMatchStartSec, useAppState } from '../state'
import { cancelDetection } from '../detectJobs'
import { ImportModal } from './ImportModal'
import { Panels } from './Panels'
import type { VideoSourceFile } from '../types'

vi.mock('../detectJobs', async (orig) => ({ ...(await orig<typeof import('../detectJobs')>()), cancelDetection: vi.fn() }))

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full' })
const s = () => useAppState.getState()
const fileInput = (): HTMLInputElement => document.querySelector('input[type="file"]') as HTMLInputElement
const choose = (json: string): void => { fireEvent.change(fileInput(), { target: { files: [new File([json], 'p.json', { type: 'application/json' })] } }) }
const paste = (value: string): void => { fireEvent.change(screen.getByRole('textbox', { name: 'Paste list' }), { target: { value } }) }

describe('ImportModal', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')], cumulativeOffsets: [0], events: [], currentFileIndex: 0, undoStack: [], redoStack: [], panel: 'import',
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
        })
    })

    it('should render both parts, file first, as a dialog', () => {
        render(<ImportModal />)
        const dialog = screen.getByRole('dialog', { name: 'Import' })
        const parts = within(dialog).getAllByRole('region')
        expect(parts.map((p) => p.getAttribute('aria-labelledby'))).toEqual(['import-file-title', 'import-paste-title'])
        expect(screen.getByRole('heading', { name: 'Import a project file' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Paste goal times' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument()
        expect(screen.getByText(/one per line: 12:34/i)).toBeInTheDocument()
    })

    it('should close on the close button, Esc and a scrim click', async () => {
        const { unmount } = render(<Panels />)
        await userEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(s().panel).toBeNull()
        unmount()
        useAppState.setState({ panel: 'import' })
        const second = render(<Panels />)
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(s().panel).toBeNull()
        second.unmount()
        useAppState.setState({ panel: 'import' })
        render(<Panels />)
        const scrim = document.querySelector('.sheet-backdrop') as HTMLElement
        fireEvent.pointerDown(scrim)
        fireEvent.click(scrim)
        expect(s().panel).toBeNull()
    })

    it('should make only the active side lime', async () => {
        render(<ImportModal />)
        expect(screen.getByRole('button', { name: 'Choose file' })).toHaveClass('btn-primary')
        expect(screen.getByRole('button', { name: 'Add events' })).not.toHaveClass('btn-primary')
        paste('07:12 Whites - Sam')
        expect(screen.getByRole('button', { name: 'Choose file' })).not.toHaveClass('btn-primary')
        expect(screen.getByRole('button', { name: 'Add 1 event' })).toHaveClass('btn-primary')
    })

    describe('paste goal times', () => {
        it('should preview parsed lines and flag the ones it cannot read', () => {
            render(<ImportModal />)
            paste('07:12 Whites - Sam\nnonsense\n1:02:03')
            const rows = within(screen.getByRole('list', { name: 'Preview' })).getAllByRole('listitem')
            expect(rows).toHaveLength(3)
            expect(rows[0]).toHaveTextContent('07:12')
            expect(rows[0]).toHaveTextContent('Whites · Sam')
            expect(rows[0].querySelector('[data-icon="goal"], .ev-icon')).not.toBeNull()
            expect(rows[1]).toHaveTextContent('nonsense')
            expect(rows[1]).toHaveTextContent(/needs a time/i)
            expect(rows[2]).toHaveTextContent('01:02:03')
            expect(screen.getByText(/1 line will be skipped/i)).toBeInTheDocument()
        })

        it('should add each parsed line as an event, undoably, and close', async () => {
            render(<ImportModal />)
            paste('07:12 Whites - Sam\n23:41 Colours - Jo\nnope')
            await userEvent.click(screen.getByRole('button', { name: 'Add 2 events' }))
            expect(s().events.map((e) => [e.matchTimeSec, e.team, e.scorer])).toEqual([[432, 'Whites', 'Sam'], [1421, 'Colours', 'Jo']])
            expect(s().panel).toBeNull()
            s().undo()
            expect(s().events).toHaveLength(0)
        })

        it('should not add anything while no line is readable', () => {
            render(<ImportModal />)
            paste('nope')
            expect(screen.getByRole('button', { name: 'Add events' })).toBeDisabled()
        })
    })

    describe('import a project file', () => {
        it('should import events (migrating legacy goals), teams and match start, then close', async () => {
            render(<ImportModal />)
            choose(JSON.stringify({
                goals: [{ id: 'x', matchTimeSec: 42, type: 'moment' }],
                teams: [{ name: 'Reds', color: '#f00', roster: [] }, { name: 'Blues', color: '#00f', roster: [] }],
                matchStartTimeSec: 30,
            }))
            await waitFor(() => expect(s().events[0]).toMatchObject({ id: 'x', type: 'highlight' }))
            expect(s().teams.map((t) => t.name)).toEqual(['Reds', 'Blues'])
            expect(s().events.find((e) => e.type === 'kick_off')).toMatchObject({ matchTimeSec: 30 })
            expect(selectMatchStartSec(s())).toBe(30)
            expect(s().panel).toBeNull()
        })

        it('should ask before replacing events, and keep them when declined', async () => {
            useAppState.setState({ events: [{ id: 'mine', matchTimeSec: 5, type: 'goal' }] })
            render(<ImportModal />)
            choose(JSON.stringify({ events: [{ id: 'theirs', matchTimeSec: 9, type: 'goal' }] }))
            const ask = await screen.findByRole('alertdialog', { name: 'Replace events' })
            expect(ask).toHaveTextContent('Replace your 1 event with the 1 in this file')
            expect(s().events[0].id).toBe('mine')
            await userEvent.click(screen.getByRole('button', { name: 'Keep mine' }))
            expect(s().events[0].id).toBe('mine')
            choose(JSON.stringify({ events: [{ id: 'theirs', matchTimeSec: 9, type: 'goal' }] }))
            await userEvent.click(await screen.findByRole('button', { name: 'Replace events' }))
            expect(s().events.map((e) => e.id)).toEqual(['theirs'])
        })

        it('should clear suggestions and cancel detection when a project is imported', async () => {
            useAppState.setState({ suggestions: [{ id: 's', globalTimeSec: 5, score: 1, source: 'audio', status: 'pending' }], suggestionRun: { createdAt: 0, source: 'audio', configVersion: 2, analysedSec: 1, total: 1 } })
            render(<ImportModal />)
            choose(JSON.stringify({ events: [] }))
            await waitFor(() => expect(s().suggestions).toEqual([]))
            expect(s().suggestionRun).toBeNull()
            expect(cancelDetection).toHaveBeenCalled()
        })

        it('should carry the graphics theme and the assist of a goal in', async () => {
            render(<ImportModal />)
            choose(JSON.stringify({ events: [{ id: 'a', matchTimeSec: 10, type: 'goal', scorer: 'Sam', assist: 'Jo' }], graphicsTheme: 'classic' }))
            await waitFor(() => expect(s().graphics.theme).toBe('classic'))
            expect(s().events[0]).toMatchObject({ id: 'a', scorer: 'Sam', assist: 'Jo' })
            s().setGraphics({ theme: 'shooot' })
        })

        it('should round-trip team goal areas and replay framing', async () => {
            render(<ImportModal />)
            const areas = { team1: { x: 0.04, y: 0.3, w: 0.4, h: 0.4 }, team2: { x: 0.56, y: 0.3, w: 0.4, h: 0.4 } }
            choose(JSON.stringify({ events: [{ id: 'x', matchTimeSec: 42, type: 'goal', replayCrop: 'team2' }], goalAreas: areas }))
            await waitFor(() => expect(s().goalAreas).toEqual(areas))
            expect(s().events[0].replayCrop).toBe('team2')
        })

        it('should migrate a project saved with left / right goal areas', async () => {
            render(<ImportModal />)
            const left = { x: 0.04, y: 0.3, w: 0.4, h: 0.4 }
            const right = { x: 0.56, y: 0.3, w: 0.4, h: 0.4 }
            choose(JSON.stringify({ events: [{ id: 'x', matchTimeSec: 42, type: 'goal', replayCrop: 'left' }], goalAreas: { left, right }, whitesAttackLeft: false }))
            await waitFor(() => expect(s().goalAreas).toEqual({ team1: left, team2: right }))
            expect(s().events[0].replayCrop).toBe('team1')
        })

        it('should restore goal marks from a project, and leave them null for an old file', async () => {
            const marks = { team1: { postL: { x: 0.1, y: 0.5 }, postR: { x: 0.2, y: 0.5 }, barL: { x: 0.1, y: 0.4 }, barR: { x: 0.2, y: 0.4 } } }
            useAppState.setState({ goalMarks: null })
            render(<ImportModal />)
            choose(JSON.stringify({ events: [], goalMarks: marks }))
            await waitFor(() => expect(s().goalMarks).toEqual(marks))
        })

        const stale = { team1: { postL: { x: 0.1, y: 0.5 }, postR: { x: 0.2, y: 0.5 }, barL: { x: 0.1, y: 0.4 }, barR: { x: 0.2, y: 0.4 } } }
        it('should clear stale goal marks when a project with goal areas but no marks is imported', async () => {
            useAppState.setState({ goalMarks: stale })
            render(<ImportModal />)
            choose(JSON.stringify({ events: [], goalAreas: null }))
            await waitFor(() => expect(s().goalMarks).toBeNull())
        })

        it('should leave the current goal marks alone when the file has neither goalMarks nor goalAreas', async () => {
            useAppState.setState({ goalMarks: stale })
            render(<ImportModal />)
            choose(JSON.stringify({ events: [{ id: 'k', matchTimeSec: 3, type: 'goal' }] }))
            await waitFor(() => expect(s().events[0].id).toBe('k'))
            expect(s().goalMarks).toEqual(stale)
        })

        it('should accept a dropped file', async () => {
            render(<ImportModal />)
            const file = new File([JSON.stringify({ events: [{ id: 'd', matchTimeSec: 3, type: 'goal' }] })], 'p.json')
            fireEvent.drop(screen.getByText('Drop a project file here').parentElement as HTMLElement, { dataTransfer: { files: [file] } })
            await waitFor(() => expect(s().events[0].id).toBe('d'))
        })

        it('should report a file that is not valid JSON and stay open', async () => {
            useAppState.setState({ events: [{ id: 'mine', matchTimeSec: 5, type: 'goal' }] })
            render(<ImportModal />)
            fireEvent.change(fileInput(), { target: { files: [new File(['nope'], 'p.json')] } })
            expect(await screen.findByText(/could not read/i)).toBeInTheDocument()
            expect(s().events).toHaveLength(1)
            expect(s().panel).toBe('import')
        })
    })
})
