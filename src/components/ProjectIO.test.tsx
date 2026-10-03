// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { ProjectIO } from './ProjectIO'

describe('ProjectIO', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [], events: [{ id: 'a', matchTimeSec: 10, type: 'goal' }], matchStartTimeSec: 0, undoStack: [], redoStack: [],
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
        expect(useAppState.getState().matchStartTimeSec).toBe(30)
    })

    it('should report a file that is not valid JSON', async () => {
        const { container } = render(<ProjectIO />)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [new File(['nope'], 'p.json')] } })
        expect(await screen.findByText(/could not read/i)).toBeInTheDocument()
        expect(useAppState.getState().events).toHaveLength(1)
    })
})
