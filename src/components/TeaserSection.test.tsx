// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { MatchEvent, Team, VideoSourceFile } from '../types'
import { EventLog } from './EventLog'
import { teaserLine } from '../graphics/plan'

vi.mock('../graphics/plan', async (orig) => { const m = await orig<typeof import('../graphics/plan')>(); return { ...m, teaserLine: vi.fn(m.teaserLine) } })

const vf = (name: string, durationSec = 600): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec, kind: 'full' })
const teams: Team[] = [
    { name: 'Whites', color: '#3a6ea5', roster: [] },
    { name: 'Colours', color: '#c2364a', roster: [] },
]
const goal = (id: string, t: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', team: 'Whites', scorer: 'Sam', ...extra })
const star = (e: MatchEvent): MatchEvent => ({ ...e, marks: ['teaser'] })
const byId = (id: string): MatchEvent | undefined => useAppState.getState().events.find((e) => e.id === id)
const teaserRows = (): HTMLElement[] => within(screen.getByRole('listbox', { name: 'Coming up' })).getAllByRole('option')
const matchRows = (): HTMLElement[] => within(screen.getByRole('listbox', { name: 'Event list' })).getAllByRole('option')
let seekToGoal: ReturnType<typeof vi.fn<(fileIndex: number, timeSec: number) => void>>

function setup(events: MatchEvent[]): void {
    seekToGoal = vi.fn()
    useAppState.setState({
        files: [vf('a.mp4')], cumulativeOffsets: [0], events, teams,
        lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, currentFileIndex: 0, currentTimeInFileSec: 0,
        undoStack: [], redoStack: [], picker: null, panel: null, seekToGoal,
    })
}

describe('Coming up section', () => {
    beforeEach(() => { document.body.innerHTML = '' })

    it('should not show when nothing is starred, and the list has no Match heading', () => {
        setup([goal('a', 100)])
        render(<EventLog />)
        expect(screen.queryByRole('listbox', { name: 'Coming up' })).not.toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Match' })).not.toBeInTheDocument()
    })

    it('should show a header with the moments and seconds, a Match heading, and one row per starred event', () => {
        setup([star(goal('a', 100)), goal('b', 200), star(goal('c', 300, { scorer: 'Priya' }))])
        render(<EventLog />)
        expect(screen.getByRole('heading', { name: /COMING UP/ })).toHaveTextContent('COMING UP')
        expect(screen.getByText(/^2 moments · \d+ s$/)).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Match' })).toBeInTheDocument()
        expect(teaserRows()).toHaveLength(2)
        expect(matchRows()).toHaveLength(3)
    })

    it('should show each row as the line it will read: automatic, or the caption', () => {
        setup([star(goal('a', 100)), star(goal('b', 200, { teaser: { caption: 'Wait for it' } }))])
        render(<EventLog />)
        const [a, b] = teaserRows()
        expect(a).toHaveTextContent('GOAL · SAM')
        expect(b).toHaveTextContent('WAIT FOR IT')
        expect(a).not.toHaveTextContent('Wait for it')
    })

    it('should word each row with the current graphics theme, as the banner does', () => {
        const base = useAppState.getState().graphics
        setup([star(goal('a', 100))])
        useAppState.setState({ graphics: { ...base, theme: 'classic' } })
        vi.mocked(teaserLine).mockClear()
        render(<EventLog />)
        expect(vi.mocked(teaserLine).mock.calls.length).toBeGreaterThan(0)
        for (const call of vi.mocked(teaserLine).mock.calls) expect(call[1]).toBe('classic')
        useAppState.setState({ graphics: base })
    })

    it('should say when the teaser is off, and how many starred moments are not loaded', () => {
        setup([star(goal('a', 100)), star(goal('u', 200, { unlinked: true, sourceFileKey: 'gone.mp4' }))])
        useAppState.setState({ highlightsTeaser: false })
        render(<EventLog />)
        expect(screen.getByText(/^1 moment · \d+ s \(1 not loaded\) · off$/)).toBeInTheDocument()
        act(() => { useAppState.setState({ highlightsTeaser: true }) })
        expect(screen.getByText(/^1 moment · \d+ s \(1 not loaded\)$/)).toBeInTheDocument()
    })

    it('should mark a moment whose teaser replay is on', () => {
        setup([star(goal('a', 100, { teaser: { replay: true } })), star(goal('b', 200))])
        render(<EventLog />)
        const [a, b] = teaserRows()
        expect(within(a).getByText('slow-mo replay')).toBeInTheDocument()
        expect(within(b).queryByText('slow-mo replay')).not.toBeInTheDocument()
    })

    it('should flag a starred moment in an unloaded file like other missing-file rows, and still list it', () => {
        setup([star(goal('a', 100, { unlinked: true, sourceFileKey: 'gone.mp4' }))])
        render(<EventLog />)
        const [row] = teaserRows()
        expect(row).toHaveAttribute('aria-disabled', 'true')
        expect(within(row).getByText('file missing')).toBeInTheDocument()
        expect(within(row).getByRole('button', { name: 'Watch' })).toBeDisabled()
    })

    it('should expand the selected row into Replay, Edit, Framing and Unstar', async () => {
        setup([star(goal('a', 100))])
        render(<EventLog />)
        await userEvent.click(teaserRows()[0])
        const actions = screen.getByRole('group', { name: 'Teaser actions' })
        expect(within(actions).getByRole('switch', { name: 'Teaser slow-mo replay' })).toHaveAttribute('aria-checked', 'false')
        expect(within(actions).getByRole('button', { name: 'Edit teaser' })).toBeEnabled()
        expect(within(actions).getByRole('button', { name: 'Teaser framing' })).toBeDisabled()
        expect(within(actions).getByRole('button', { name: 'Unstar' })).toBeEnabled()
        // Only the teaser row opened, not the same event's match row
        expect(screen.queryAllByRole('group', { name: 'Event actions' }).length).toBe(0)
    })

    it('should switch the teaser replay (not the event\'s) and enable Framing', async () => {
        setup([star(goal('a', 100))])
        render(<EventLog />)
        await userEvent.click(teaserRows()[0])
        await userEvent.click(screen.getByRole('switch', { name: 'Teaser slow-mo replay' }))
        expect(byId('a')?.teaser?.replay).toBe(true)
        expect(byId('a')?.replay).toBeUndefined()
        expect(screen.getByRole('button', { name: 'Teaser framing' })).toBeEnabled()
        await userEvent.click(screen.getByRole('switch', { name: 'Teaser slow-mo replay' }))
        expect(byId('a')?.teaser).toBeUndefined()
    })

    it('should open the teaser sheet from Edit and the teaser framing from Framing', async () => {
        setup([star(goal('a', 100, { teaser: { replay: true } }))])
        render(<EventLog />)
        await userEvent.click(teaserRows()[0])
        await userEvent.click(screen.getByRole('button', { name: 'Edit teaser' }))
        expect(useAppState.getState()).toMatchObject({ panel: 'event', editingEventId: 'a', editingView: 'details', editingTarget: 'teaser' })
        await userEvent.click(screen.getByRole('button', { name: 'Teaser framing' }))
        expect(useAppState.getState()).toMatchObject({ editingView: 'framing', editingTarget: 'teaser' })
    })

    it('should unstar from the action, dropping the teaser edits, and the section goes away with the last one', async () => {
        setup([star(goal('a', 100, { teaser: { caption: 'x' } }))])
        render(<EventLog />)
        await userEvent.click(teaserRows()[0])
        await userEvent.click(screen.getByRole('button', { name: 'Unstar' }))
        expect(byId('a')?.marks).toBeUndefined()
        expect(byId('a')?.teaser).toBeUndefined()
        expect(screen.queryByRole('listbox', { name: 'Coming up' })).not.toBeInTheDocument()
    })

    it('should seek to the teaser clip start on Watch (its own seconds before)', async () => {
        setup([star(goal('a', 100, { teaser: { beforeSec: 3 } })), star(goal('b', 200))])
        render(<EventLog />)
        await userEvent.click(within(teaserRows()[0]).getByRole('button', { name: 'Watch' }))
        expect(seekToGoal).toHaveBeenLastCalledWith(0, 97)
        await userEvent.click(within(teaserRows()[1]).getByRole('button', { name: 'Watch' }))
        expect(seekToGoal).toHaveBeenLastCalledWith(0, 190)
    })

    it('should jump to the moment\'s Coming up step on Watch during a preview, staying in the preview', async () => {
        setup([star(goal('a', 100)), star(goal('b', 200)), goal('c', 300)])
        useAppState.getState().startPreview()
        const steps = useAppState.getState().previewSteps
        const stepB = steps.findIndex((x) => x.teaser && !x.replay && x.eventIds.includes('b'))
        expect(stepB).toBeGreaterThan(0)
        render(<EventLog />)
        await userEvent.click(within(teaserRows()[1]).getByRole('button', { name: 'Watch' }))
        expect(useAppState.getState().isPreviewMode).toBe(true)
        expect(useAppState.getState().currentPreviewSegment).toBe(stepB)
        expect(seekToGoal).not.toHaveBeenCalled()
        useAppState.getState().exitPreview()
    })

    it('should reset the selection when the selected teaser row goes away outside the log (unstarred elsewhere, undo)', async () => {
        setup([star(goal('a', 100)), goal('b', 200)])
        render(<EventLog />)
        await userEvent.click(teaserRows()[0])
        act(() => { useAppState.getState().toggleMark('a', 'teaser') })
        expect(screen.queryByRole('listbox', { name: 'Coming up' })).not.toBeInTheDocument()
        expect(matchRows()[0]).toHaveAttribute('aria-selected', 'true') // the same event, now selected in the match list
        fireEvent.keyDown(screen.getByRole('region', { name: 'Events' }), { key: 'Enter' })
        expect(seekToGoal).toHaveBeenCalledWith(0, 90) // keys work again
    })
})

describe('Coming up keyboard', () => {
    beforeEach(() => { document.body.innerHTML = '' })
    const key = (k: string): void => { fireEvent.keyDown(screen.getByRole('region', { name: 'Events' }), { key: k }) }

    it('should move through the teaser rows then the match rows as one list', () => {
        setup([star(goal('a', 100)), goal('b', 200), star(goal('c', 300))])
        render(<EventLog />)
        key('ArrowDown'); expect(teaserRows()[0]).toHaveAttribute('aria-selected', 'true')
        key('ArrowDown'); expect(teaserRows()[1]).toHaveAttribute('aria-selected', 'true')
        key('ArrowDown'); expect(matchRows()[0]).toHaveAttribute('aria-selected', 'true')
        expect(teaserRows()[1]).toHaveAttribute('aria-selected', 'false')
        key('ArrowDown'); key('ArrowDown'); key('ArrowDown')
        expect(matchRows()[2]).toHaveAttribute('aria-selected', 'true')
        key('ArrowUp'); key('ArrowUp'); key('ArrowUp')
        expect(teaserRows()[1]).toHaveAttribute('aria-selected', 'true')
    })

    it('should toggle the teaser replay with R, edit with E, watch with Enter on a teaser row', () => {
        setup([star(goal('a', 100))])
        render(<EventLog />)
        key('ArrowDown')
        key('r'); expect(byId('a')?.teaser?.replay).toBe(true)
        key('Enter'); expect(seekToGoal).toHaveBeenCalledWith(0, 90)
        key('e'); expect(useAppState.getState()).toMatchObject({ panel: 'event', editingTarget: 'teaser', editingView: 'details' })
    })

    it('should unstar with Delete on a teaser row and select a neighbour', () => {
        setup([star(goal('a', 100)), star(goal('b', 200))])
        render(<EventLog />)
        key('ArrowDown')
        key('Delete')
        expect(byId('a')?.marks).toBeUndefined()
        expect(byId('b')?.marks).toEqual(['teaser'])
        expect(byId('a')).toBeDefined() // the event stays; only the star goes
        expect(teaserRows()).toHaveLength(1)
        expect(teaserRows()[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('should still open the Star menu with S on a match row', () => {
        setup([star(goal('a', 100)), goal('b', 200)])
        render(<EventLog />)
        key('End')
        expect(matchRows()[1]).toHaveAttribute('aria-selected', 'true')
        key('s')
        expect(screen.getByRole('menu', { name: 'Star' })).toBeInTheDocument()
    })
})
