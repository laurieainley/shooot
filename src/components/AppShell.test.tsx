// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'
import { setMedia } from '../test/pointer'

vi.mock('./Player', () => ({ Player: () => <div data-testid="player" /> }))
vi.mock('../render', () => ({ renderReel: vi.fn() }))

import { AppShell } from './AppShell'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full' })

function setWidth(desktop: boolean): void {
    setMedia({ desktop, coarse: !desktop })
}

/** A phone on its side: short and (for 915×412) possibly wider than 900px. */
function setLandscape(wide = false): void {
    setMedia({ desktop: wide, coarse: true, landscape: true })
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
        // The time is captured, but no event exists until a type is chosen
        expect(useAppState.getState().events).toEqual([])
        expect(useAppState.getState().picker?.pending).toEqual({ matchTimeSec: 12, sourceFileIndex: 0 })
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
        expect(screen.getByText(/drop your match videos here.*mp4 or mov from a phone or camera/i)).toBeInTheDocument()
        expect(screen.getByText(/no events yet/i)).toBeInTheDocument()
    })

    it('should show the preview controls over the player while previewing', () => {
        setWidth(true)
        useAppState.setState({ isPreviewMode: true, previewSegments: [{ startTime: 0, endTime: 10, sourceFileIndex: 0, goals: [], duration: 10 }], currentPreviewSegment: 0 })
        render(<AppShell />)
        expect(screen.getByRole('group', { name: 'Preview' })).toBeInTheDocument()
    })

    it('should put the preview bar below the video on the phone', () => {
        setWidth(false)
        useAppState.setState({ isPreviewMode: true, previewSegments: [], previewSteps: [{ sourceIndex: 0, startSec: 0, endSec: 10, speed: 1, gain: 1, replay: false, clipIndex: 0 }], currentPreviewSegment: 0 })
        const { container } = render(<AppShell />)
        const bar = screen.getByRole('group', { name: 'Preview' })
        expect(container.querySelector('.stage')).not.toContainElement(bar)
        expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument()
    })

    describe('landscape phone', () => {
        it.each([false, true])('should put the video and match strip beside the event rail (wider than 900px: %s)', (wide) => {
            setLandscape(wide)
            const { container } = render(<AppShell />)
            expect(container.firstElementChild).toHaveClass('shell--landscape')
            const rail = screen.getByRole('complementary', { name: 'Event rail' })
            expect(rail).toContainElement(screen.getByRole('region', { name: 'Events' }))
            const left = container.querySelector('.bay__left')
            expect(left).toContainElement(screen.getByTestId('player'))
            expect(left).toContainElement(screen.getByRole('slider', { name: 'Match timeline' }))
        })

        it('should use the compact top bar: no file pills, no Match button, no key hints', () => {
            setLandscape(true)
            render(<AppShell />)
            expect(screen.queryByText('GX010226.MP4', { selector: '.file-pill__name' })).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Match' })).not.toBeInTheDocument()
            expect(screen.queryByText('mark')).not.toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument()
        })

        it('should keep the ＋ mark button in the rail, off the video', async () => {
            setLandscape()
            const { container } = render(<AppShell />)
            const fab = screen.getByRole('button', { name: 'Mark event' })
            expect(container.querySelector('.stage')).not.toContainElement(fab)
            await userEvent.click(fab)
            expect(useAppState.getState().picker?.pending).toBeDefined()
        })

        it('should float the preview bar over the picture rather than stacking it below', () => {
            setLandscape()
            useAppState.setState({ isPreviewMode: true, previewSegments: [], previewSteps: [{ sourceIndex: 0, startSec: 0, endSec: 10, speed: 1, gain: 1, replay: false, clipIndex: 0 }], currentPreviewSegment: 0 })
            const { container } = render(<AppShell />)
            expect(container.querySelector('.stage')).toContainElement(screen.getByRole('group', { name: 'Preview' }))
        })
    })

    it('should offer a slot in the rail / stack for the touch add and edit panels', () => {
        setWidth(true)
        const { container } = render(<AppShell />)
        expect(container.querySelector('.rail > .panel-slot')).toBeInTheDocument()
    })

    describe('rotating', () => {
        it('should keep the very same player element when the layout changes, so fullscreen survives a rotation', () => {
            setWidth(false)
            const { container } = render(<AppShell />)
            const player = screen.getByTestId('player')
            const stage = container.querySelector('.stage')
            act(() => setMedia({ desktop: false, coarse: true, landscape: true }))
            expect(container.firstElementChild).toHaveClass('shell--landscape')
            expect(screen.getByTestId('player')).toBe(player)
            expect(container.querySelector('.stage')).toBe(stage)
            act(() => setMedia({ desktop: true, coarse: true, tablet: true, portrait: true }))
            expect(container.firstElementChild).toHaveClass('shell--tablet')
            expect(screen.getByTestId('player')).toBe(player)
            act(() => setMedia({ desktop: true, coarse: true, tablet: true }))
            expect(container.firstElementChild).toHaveClass('shell--desktop')
            expect(screen.getByTestId('player')).toBe(player)
            act(() => setWidth(false))
            expect(container.firstElementChild).toHaveClass('shell--phone')
            expect(screen.getByTestId('player')).toBe(player)
        })
    })

    describe('top bar out of the way', () => {
        it('should collapse the top bar in landscape and bring it back from the handle', async () => {
            setLandscape()
            useAppState.setState({ barCollapsed: false })
            const { container } = render(<AppShell />)
            await userEvent.click(screen.getByRole('button', { name: 'Hide top bar' }))
            expect(container.querySelector('.top-bar')).toBeNull()
            expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument()
            await userEvent.click(screen.getByRole('button', { name: 'Show top bar' }))
            expect(container.querySelector('.top-bar')).not.toBeNull()
            expect(useAppState.getState().barCollapsed).toBe(false)
        })

        it('should hide the portrait top bar while scrolling down and show it on scrolling up', () => {
            setWidth(false)
            const { container } = render(<AppShell />)
            const bar = container.querySelector('.top-bar')!
            const scrollTo = (y: number): void => { act(() => { Object.defineProperty(window, 'scrollY', { configurable: true, value: y }); window.dispatchEvent(new Event('scroll')) }) }
            scrollTo(100); scrollTo(300)
            expect(bar).toHaveClass('top-bar--hidden')
            scrollTo(250)
            expect(bar).not.toHaveClass('top-bar--hidden')
        })
    })
})
