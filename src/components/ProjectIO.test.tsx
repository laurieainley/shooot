// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { ProjectIO } from './ProjectIO'

describe('ProjectIO', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [], events: [{ id: 'a', matchTimeSec: 10, type: 'goal', team: 'Whites', scorer: 'Sam', assist: 'Jo' }], undoStack: [], redoStack: [],
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
        })
    })

    const exported = async (): Promise<Record<string, unknown>> => {
        const createObjectURL = vi.fn((b: Blob) => { void b; return 'blob:x' })
        Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
        render(<ProjectIO />)
        await userEvent.click(screen.getByRole('menuitem', { name: /export project/i }))
        expect(click).toHaveBeenCalled()
        click.mockRestore()
        return JSON.parse(await (createObjectURL.mock.calls[0][0] as Blob).text())
    }

    it('should download the events, teams and match start as project.json', async () => {
        expect(await exported()).toMatchObject({ events: [{ id: 'a' }], teams: [{ name: 'Whites' }, { name: 'Colours' }], matchStartTimeSec: 0 })
    })

    it('should carry the graphics theme and the assist of a goal out', async () => {
        useAppState.getState().setGraphics({ theme: 'classic' })
        const data = await exported()
        expect(data.graphicsTheme).toBe('classic')
        expect((data.events as { assist: string }[])[0].assist).toBe('Jo')
        useAppState.getState().setGraphics({ theme: 'shooot' })
    })

    it('should be disabled with no events', () => {
        useAppState.setState({ events: [] })
        render(<ProjectIO />)
        expect(screen.getByRole('menuitem', { name: /export project/i })).toBeDisabled()
    })
})
