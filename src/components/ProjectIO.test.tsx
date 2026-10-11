// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { selectMatchStartSec, useAppState } from '../state'
import { cancelDetection } from '../detectJobs'
import { ProjectIO } from './ProjectIO'

vi.mock('../detectJobs', async (orig) => ({ ...(await orig<typeof import('../detectJobs')>()), cancelDetection: vi.fn() }))

describe('ProjectIO', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [], events: [{ id: 'a', matchTimeSec: 10, type: 'goal' }], undoStack: [], redoStack: [],
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
        })
    })

    it('should download the events, teams and match start as project.json', async () => {
        const createObjectURL = vi.fn((b: Blob) => { void b; return 'blob:x' })
        Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
        render(<ProjectIO />)
        await userEvent.click(screen.getByRole('button', { name: /export project/i }))
        expect(click).toHaveBeenCalled()
        const data = JSON.parse(await (createObjectURL.mock.calls[0][0] as Blob).text())
        expect(data).toMatchObject({ events: [{ id: 'a' }], teams: [{ name: 'Whites' }, { name: 'Colours' }], matchStartTimeSec: 0 })
        click.mockRestore()
    })

    it('should carry the graphics theme out and back in', async () => {
        const createObjectURL = vi.fn((b: Blob) => { void b; return 'blob:x' })
        Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
        useAppState.getState().setGraphics({ theme: 'classic' })
        const { container } = render(<ProjectIO />)
        await userEvent.click(screen.getByRole('button', { name: /export project/i }))
        const data = JSON.parse(await (createObjectURL.mock.calls[0][0] as Blob).text())
        expect(data.graphicsTheme).toBe('classic')
        click.mockRestore()
        useAppState.getState().setGraphics({ theme: 'shooot' })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [new File([JSON.stringify(data)], 'p.json', { type: 'application/json' })] } })
        await waitFor(() => expect(useAppState.getState().graphics.theme).toBe('classic'))
        useAppState.getState().setGraphics({ theme: 'shooot' })
    })

    it('should export goal marks, import them, and leave them null for an old file', async () => {
        const marks = { team1: { postL: { x: 0.1, y: 0.5 }, postR: { x: 0.2, y: 0.5 }, barL: { x: 0.1, y: 0.4 }, barR: { x: 0.2, y: 0.4 } } }
        const createObjectURL = vi.fn((b: Blob) => { void b; return 'blob:x' })
        Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
        useAppState.setState({ goalMarks: marks })
        const { container } = render(<ProjectIO />)
        await userEvent.click(screen.getByRole('button', { name: /export project/i }))
        const data = JSON.parse(await (createObjectURL.mock.calls[0][0] as Blob).text())
        click.mockRestore()
        expect(data.goalMarks).toEqual(marks)
        useAppState.setState({ goalMarks: null })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [new File([JSON.stringify(data)], 'p.json', { type: 'application/json' })] } })
        await waitFor(() => expect(useAppState.getState().goalMarks).toEqual(marks))
        useAppState.setState({ goalMarks: null })
        fireEvent.change(input, { target: { files: [new File([JSON.stringify({ events: [], teams: [] })], 'old.json', { type: 'application/json' })] } })
        await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
        expect(useAppState.getState().goalMarks).toBeNull()
    })

    it('should import events (migrating legacy goals), teams and match start', async () => {
        const { container } = render(<ProjectIO />)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        const json = JSON.stringify({
            goals: [{ id: 'x', matchTimeSec: 42, type: 'moment' }],
            teams: [{ name: 'Reds', color: '#f00', roster: [] }, { name: 'Blues', color: '#00f', roster: [] }],
            matchStartTimeSec: 30,
        })
        fireEvent.change(input, { target: { files: [new File([json], 'p.json', { type: 'application/json' })] } })
        await waitFor(() => expect(useAppState.getState().events[0]).toMatchObject({ id: 'x', type: 'highlight' }))
        expect(useAppState.getState().teams.map((t) => t.name)).toEqual(['Reds', 'Blues'])
        expect(useAppState.getState().events.find((e) => e.type === 'kick_off')).toMatchObject({ globalTimeSec: 30 })
        expect(selectMatchStartSec(useAppState.getState())).toBe(30)
    })

    it('should clear suggestions and cancel detection when a project is imported', async () => {
        useAppState.setState({ suggestions: [{ id: 's', globalTimeSec: 5, score: 1, source: 'audio', status: 'pending' }], suggestionRun: { createdAt: 0, source: 'audio', configVersion: 2, analysedSec: 1, total: 1 } })
        const { container } = render(<ProjectIO />)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [new File([JSON.stringify({ events: [] })], 'p.json', { type: 'application/json' })] } })
        await waitFor(() => expect(useAppState.getState().suggestions).toEqual([]))
        expect(useAppState.getState().suggestionRun).toBeNull()
        expect(cancelDetection).toHaveBeenCalled()
    })

    it('should export and import the assist of a goal', async () => {
        useAppState.setState({ events: [{ id: 'a', matchTimeSec: 10, type: 'goal', team: 'Whites', scorer: 'Sam', assist: 'Jo' }] })
        const createObjectURL = vi.fn((b: Blob) => { void b; return 'blob:x' })
        Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
        const { container } = render(<ProjectIO />)
        await userEvent.click(screen.getByRole('button', { name: /export project/i }))
        const json = await (createObjectURL.mock.calls[0][0] as Blob).text()
        click.mockRestore()
        expect(JSON.parse(json).events[0].assist).toBe('Jo')
        useAppState.setState({ events: [] })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [new File([json], 'p.json', { type: 'application/json' })] } })
        await waitFor(() => expect(useAppState.getState().events[0]).toMatchObject({ id: 'a', scorer: 'Sam', assist: 'Jo' }))
    })

    it('should round-trip team goal areas and replay framing', async () => {
        const { container } = render(<ProjectIO />)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        const areas = { team1: { x: 0.04, y: 0.3, w: 0.4, h: 0.4 }, team2: { x: 0.56, y: 0.3, w: 0.4, h: 0.4 } }
        const json = JSON.stringify({ events: [{ id: 'x', matchTimeSec: 42, type: 'goal', replayCrop: 'team2' }], goalAreas: areas })
        fireEvent.change(input, { target: { files: [new File([json], 'p.json')] } })
        await waitFor(() => expect(useAppState.getState().goalAreas).toEqual(areas))
        expect(useAppState.getState().events[0].replayCrop).toBe('team2')
    })

    it('should migrate a project saved with left / right goal areas', async () => {
        const { container } = render(<ProjectIO />)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        const left = { x: 0.04, y: 0.3, w: 0.4, h: 0.4 }
        const right = { x: 0.56, y: 0.3, w: 0.4, h: 0.4 }
        const json = JSON.stringify({ events: [{ id: 'x', matchTimeSec: 42, type: 'goal', replayCrop: 'left' }], goalAreas: { left, right }, whitesAttackLeft: false })
        fireEvent.change(input, { target: { files: [new File([json], 'p.json')] } })
        await waitFor(() => expect(useAppState.getState().goalAreas).toEqual({ team1: left, team2: right }))
        expect(useAppState.getState().events[0].replayCrop).toBe('team1')
    })

    it('should report a file that is not valid JSON', async () => {
        const { container } = render(<ProjectIO />)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [new File(['nope'], 'p.json')] } })
        expect(await screen.findByText(/could not read/i)).toBeInTheDocument()
        expect(useAppState.getState().events).toHaveLength(1)
    })
})
