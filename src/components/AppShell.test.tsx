// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'

vi.mock('./Player', () => ({ Player: () => <div data-testid="player" /> }))
vi.mock('../render', () => ({ renderReel: vi.fn() }))

import { AppShell } from './AppShell'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full' })

function setWidth(desktop: boolean): void {
    window.matchMedia = ((query: string) => ({
        matches: desktop, media: query, onchange: null,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
}

describe('AppShell', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('GX010226.MP4')], cumulativeOffsets: [0], events: [], picker: null, currentFileIndex: 0,
            currentTimeInFileSec: 12.4, isPreviewMode: false, undoStack: [], redoStack: [], panel: null,
        })
    })

    it('should lay out the edit bay with the event rail, clip summary and key hints at 900px and wider', () => {
        setWidth(true)
        render(<AppShell />)
        expect(screen.getByTestId('player')).toBeInTheDocument()
        expect(screen.getByRole('slider', { name: 'Match timeline' })).toBeInTheDocument()
        expect(screen.getByRole('complementary', { name: 'Event rail' })).toContainElement(screen.getByRole('region', { name: 'Events' }))
        expect(screen.getByLabelText('Clip summary')).toBeInTheDocument()
        expect(screen.getByText('mark')).toBeInTheDocument()
        expect(screen.getByText('GX010226.MP4', { selector: '.file-pill__name' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Mark event' })).not.toBeInTheDocument()
    })

    it('should stack the phone layout with a mark-event button under 900px', async () => {
        setWidth(false)
        render(<AppShell />)
        expect(screen.queryByRole('complementary', { name: 'Event rail' })).not.toBeInTheDocument()
        expect(screen.queryByText('mark')).not.toBeInTheDocument()
        expect(screen.getByRole('region', { name: 'Events' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Mark event' }))
        const [e] = useAppState.getState().events
        expect(e).toMatchObject({ matchTimeSec: 12, type: 'goal' })
        expect(useAppState.getState().picker).toEqual({ eventId: e.id })
        expect(screen.queryByRole('button', { name: 'Mark event' })).not.toBeInTheDocument()
    })

    it('should keep the files and Match setup behind the overflow menu on the phone', async () => {
        setWidth(false)
        render(<AppShell />)
        expect(screen.queryByRole('dialog', { name: 'Files' })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Files' }))
        expect(screen.getByRole('dialog', { name: 'Files' })).toHaveTextContent('GX010226.MP4')
        await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Match setup' }))
        expect(screen.queryByRole('dialog', { name: 'Files' })).not.toBeInTheDocument()
        expect(screen.getByLabelText('Team 1 name')).toBeInTheDocument()
    })

    it('should edit clip and replay settings from ⋯ → Advanced settings on desktop', async () => {
        setWidth(true)
        render(<AppShell />)
        await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Advanced settings' }))
        expect(screen.getByRole('dialog', { name: 'Advanced settings' })).toBeInTheDocument()
        expect(screen.getByLabelText('Replay before')).toBeInTheDocument()
    })

    it('should open Match setup from the top bar on desktop', async () => {
        setWidth(true)
        render(<AppShell />)
        await userEvent.click(screen.getByRole('button', { name: 'Match' }))
        expect(screen.getByLabelText('Team 1 name')).toBeInTheDocument()
    })

    it('should show the drop zone and an empty log before any file is loaded', () => {
        setWidth(true)
        useAppState.setState({ files: [], cumulativeOffsets: [] })
        render(<AppShell />)
        expect(screen.queryByTestId('player')).not.toBeInTheDocument()
        expect(screen.getByText(/drop gopro mp4s/i)).toBeInTheDocument()
        expect(screen.getByText(/no events yet/i)).toBeInTheDocument()
    })

    it('should show the preview controls over the player while previewing', () => {
        setWidth(true)
        useAppState.setState({ isPreviewMode: true, previewSegments: [{ startTime: 0, endTime: 10, sourceFileIndex: 0, goals: [], duration: 10 }], currentPreviewSegment: 0 })
        render(<AppShell />)
        expect(screen.getByRole('group', { name: 'Preview' })).toBeInTheDocument()
    })
})
