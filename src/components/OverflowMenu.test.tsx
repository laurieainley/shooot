// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { OverflowMenu } from './OverflowMenu'
import type { MatchEvent, VideoSourceFile } from '../types'

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
        expect(items).toEqual(['New match…', 'Files', 'Advanced settings', 'Paste list', 'Send project to another device', 'Export project', 'Import project', 'Shortcuts'])
    })

    it('should keep Setup in the menu on the phone, where the bar has no room for it', async () => {
        render(<OverflowMenu layout="phone" />)
        await open()
        expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toContain('Setup')
        await userEvent.click(screen.getByRole('menuitem', { name: 'Match setup' }))
        expect(s().panel).toBe('match')
    })

    it('should open the Shortcuts sheet from the menu', async () => {
        render(<OverflowMenu />)
        await open()
        await userEvent.click(screen.getByRole('menuitem', { name: 'Shortcuts' }))
        expect(s().panel).toBe('shortcuts')
    })

    it.each([['Files', 'files'], ['Advanced settings', 'settings'], ['Paste list', 'paste']] as const)(
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

    it('should ask before a new match, and clear on confirm', async () => {
        render(<OverflowMenu />)
        await open()
        await userEvent.click(screen.getByRole('menuitem', { name: /new match/i }))
        expect(s().events).toHaveLength(2)
        expect(screen.getByText(/clear 2 events and unload the videos/i)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: /clear and start/i }))
        expect(s().events).toEqual([])
        expect(s().files).toEqual([])
        expect(s().panel).toBeNull()
    })

    it('should keep everything when the new match is cancelled', async () => {
        render(<OverflowMenu />)
        await open()
        await userEvent.click(screen.getByRole('menuitem', { name: /new match/i }))
        await userEvent.click(screen.getByRole('button', { name: /keep/i }))
        expect(s().events).toHaveLength(2)
        expect(screen.queryByText(/clear 2 events/i)).not.toBeInTheDocument()
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
