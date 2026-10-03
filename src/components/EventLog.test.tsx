// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { EventLog } from './EventLog'
import type { MatchEvent, Team, VideoSourceFile } from '../types'

const vf = (name: string, durationSec = 600): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec, kind: 'full' })
const teams: Team[] = [
    { name: 'Whites', color: '#3a6ea5', roster: ['Sam Taylor', 'Priya'] },
    { name: 'Colours', color: '#c2364a', roster: ['Jo Smith', 'Jonas', 'Ade'] },
]
const byId = (id: string): MatchEvent | undefined => useAppState.getState().events.find((e) => e.id === id)
const rows = (): HTMLElement[] => screen.getAllByRole('option')
const log = (): HTMLElement => screen.getByRole('region', { name: 'Events' })

let seekToGoal: ReturnType<typeof vi.fn<(fileIndex: number, timeSec: number) => void>>

function setup(events: MatchEvent[], extra: Partial<ReturnType<typeof useAppState.getState>> = {}): void {
    seekToGoal = vi.fn()
    useAppState.setState({
        files: [vf('a.mp4')], cumulativeOffsets: [0], events, teams, matchStartTimeSec: 0,
        lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, currentFileIndex: 0, currentTimeInFileSec: 0,
        undoStack: [], redoStack: [], picker: null, seekToGoal, ...extra,
    })
}

describe('EventLog rows', () => {
    it('should show the match clock, label with scorer and the team colour dot', () => {
        setup([{ id: 'a', matchTimeSec: 1521, sourceFileIndex: 0, type: 'goal', pen: true, team: 'Colours', scorer: 'Jo' }], { matchStartTimeSec: 100 })
        render(<EventLog />)
        const [row] = rows()
        expect(within(row).getByText('23:41')).toBeInTheDocument()
        expect(within(row).getByText('Goal (pen) · Jo')).toBeInTheDocument()
        expect(row.querySelector('[data-team-dot]')).toHaveStyle({ background: '#c2364a' })
    })

    it('should show file time when no match start is set, and a minus for events before kick-off', () => {
        setup([
            { id: 'a', matchTimeSec: 75, sourceFileIndex: 0, type: 'highlight' },
        ])
        const { unmount } = render(<EventLog />)
        expect(within(rows()[0]).getByText('01:15')).toBeInTheDocument()
        unmount()
        setup([{ id: 'a', matchTimeSec: 70, sourceFileIndex: 0, type: 'highlight' }], { matchStartTimeSec: 100 })
        render(<EventLog />)
        expect(within(rows()[0]).getByText('−00:30')).toBeInTheDocument()
    })

    it('should tag the file only when more than one file is loaded', () => {
        setup([{ id: 'a', matchTimeSec: 10, sourceFileIndex: 1, type: 'goal' }], { files: [vf('a.mp4'), vf('b.mp4')], cumulativeOffsets: [0, 600] })
        const { unmount } = render(<EventLog />)
        expect(within(rows()[0]).getByText('V2')).toBeInTheDocument()
        unmount()
        setup([{ id: 'a', matchTimeSec: 10, sourceFileIndex: 0, type: 'goal' }])
        render(<EventLog />)
        expect(within(rows()[0]).queryByText('V1')).not.toBeInTheDocument()
    })

    it('should tag unlinked events as file missing and not seek when they are clicked', async () => {
        setup([
            { id: 'linked', matchTimeSec: 10, sourceFileIndex: 0, sourceFileKey: 'a.mp4', type: 'goal' },
            { id: 'orphan', matchTimeSec: 20, sourceFileIndex: 1, sourceFileKey: 'gone.mp4', unlinked: true, type: 'goal' },
        ])
        render(<EventLog />)
        const orphan = rows()[1]
        expect(within(orphan).getByText(/file missing/i)).toBeInTheDocument()
        expect(orphan).toHaveAttribute('aria-disabled', 'true')
        await userEvent.click(orphan)
        expect(seekToGoal).not.toHaveBeenCalled()
    })

    it('should show an empty message when there are no events', () => {
        setup([])
        render(<EventLog />)
        expect(screen.getByText(/no events yet/i)).toBeInTheDocument()
    })
})

describe('EventLog selection and keys', () => {
    beforeEach(() => {
        setup([
            { id: 'a', matchTimeSec: 30, sourceFileIndex: 0, type: 'goal' },
            { id: 'b', matchTimeSec: 60, sourceFileIndex: 0, type: 'highlight' },
            { id: 'c', matchTimeSec: 90, sourceFileIndex: 0, type: 'goal' },
        ])
    })

    it('should select a clicked row and seek to its clip start', async () => {
        render(<EventLog />)
        await userEvent.click(rows()[1])
        expect(rows()[1]).toHaveAttribute('aria-selected', 'true')
        expect(seekToGoal).toHaveBeenCalledWith(0, 50)
    })

    it('should move the selection with ArrowDown / ArrowUp while the log is focused', () => {
        render(<EventLog />)
        log().focus()
        fireEvent.keyDown(log(), { key: 'ArrowDown' })
        expect(rows()[0]).toHaveAttribute('aria-selected', 'true')
        fireEvent.keyDown(log(), { key: 'ArrowDown' })
        fireEvent.keyDown(log(), { key: 'ArrowDown' })
        fireEvent.keyDown(log(), { key: 'ArrowDown' })
        expect(rows()[2]).toHaveAttribute('aria-selected', 'true')
        fireEvent.keyDown(log(), { key: 'ArrowUp' })
        expect(rows()[1]).toHaveAttribute('aria-selected', 'true')
        expect(seekToGoal).not.toHaveBeenCalled()
    })

    it('should seek on Enter, remove on Delete or Backspace, and toggle replay on R', () => {
        render(<EventLog />)
        log().focus()
        fireEvent.keyDown(log(), { key: 'ArrowDown' })
        fireEvent.keyDown(log(), { key: 'Enter' })
        expect(seekToGoal).toHaveBeenCalledWith(0, 20)
        fireEvent.keyDown(log(), { key: 'r' })
        expect(byId('a')?.replay).toBe(false)
        fireEvent.keyDown(log(), { key: 'R' })
        expect(byId('a')?.replay).toBe(true)
        fireEvent.keyDown(log(), { key: 'Delete' })
        expect(byId('a')).toBeUndefined()
        // selection moves to the row that took its place
        expect(rows()[0]).toHaveAttribute('aria-selected', 'true')
        fireEvent.keyDown(log(), { key: 'Backspace' })
        expect(byId('b')).toBeUndefined()
    })

    it('should toggle replay for a highlight to on (opposite of its default)', () => {
        render(<EventLog />)
        log().focus()
        fireEvent.keyDown(log(), { key: 'ArrowDown' })
        fireEvent.keyDown(log(), { key: 'ArrowDown' })
        fireEvent.keyDown(log(), { key: 'r' })
        expect(byId('b')?.replay).toBe(true)
    })

    it('should ignore keys when the log is not focused', () => {
        render(<EventLog />)
        fireEvent.keyDown(document.body, { key: 'ArrowDown' })
        fireEvent.keyDown(document.body, { key: 'Delete' })
        fireEvent.keyDown(document.body, { key: 'r' })
        expect(rows().some((r) => r.getAttribute('aria-selected') === 'true')).toBe(false)
        expect(useAppState.getState().events).toHaveLength(3)
    })

    it('should focus the log on L and give focus back on Escape', () => {
        render(<EventLog />)
        fireEvent.keyDown(document.body, { key: 'l' })
        expect(document.activeElement).toBe(log())
        fireEvent.keyDown(log(), { key: 'Escape' })
        expect(document.activeElement).not.toBe(log())
    })

    it('should not take focus on L while typing in a field or while the picker is open', () => {
        render(<><input aria-label="other" /><EventLog /></>)
        const other = screen.getByLabelText('other')
        other.focus()
        fireEvent.keyDown(other, { key: 'l' })
        expect(document.activeElement).toBe(other)
        other.blur()
        useAppState.setState({ picker: { eventId: 'a' } })
        fireEvent.keyDown(document.body, { key: 'l' })
        expect(document.activeElement).not.toBe(log())
    })
})

describe('EventLog replay toggle', () => {
    beforeEach(() => {
        setup([
            { id: 'g', matchTimeSec: 10, sourceFileIndex: 0, type: 'goal' },
            { id: 'h', matchTimeSec: 20, sourceFileIndex: 0, type: 'highlight' },
        ])
    })

    it('should show a pressed Replay button for goals and an unpressed one otherwise', () => {
        render(<EventLog />)
        const [goal, highlight] = screen.getAllByRole('button', { name: 'Replay' })
        expect(goal).toHaveAttribute('aria-pressed', 'true')
        expect(highlight).toHaveAttribute('aria-pressed', 'false')
    })

    it('should flip the effective replay setting when clicked, without seeking', async () => {
        render(<EventLog />)
        const [goal, highlight] = screen.getAllByRole('button', { name: 'Replay' })
        await userEvent.click(goal)
        await userEvent.click(highlight)
        expect(byId('g')?.replay).toBe(false)
        expect(byId('h')?.replay).toBe(true)
        expect(seekToGoal).not.toHaveBeenCalled()
    })

    it('should delete an event from its × button', async () => {
        render(<EventLog />)
        await userEvent.click(screen.getAllByRole('button', { name: 'Delete event' })[0])
        expect(byId('g')).toBeUndefined()
    })
})

describe('EventLog inline edit', () => {
    beforeEach(() => {
        setup([{ id: 'a', matchTimeSec: 30, sourceFileIndex: 0, type: 'goal', team: 'Colours' }])
    })

    it('should not show team or scorer inputs until a cell is double-clicked', () => {
        render(<EventLog />)
        expect(screen.queryByRole('textbox', { name: 'Scorer' })).not.toBeInTheDocument()
        expect(screen.queryByPlaceholderText('Team')).not.toBeInTheDocument()
    })

    it('should edit the scorer with roster suggestions and save the highlighted one on Enter', async () => {
        render(<EventLog />)
        await userEvent.dblClick(within(rows()[0]).getByText('Goal'))
        const input = screen.getByRole('textbox', { name: 'Scorer' })
        await userEvent.type(input, 'jo')
        const suggestions = screen.getByRole('listbox', { name: 'Scorer suggestions' })
        expect(within(suggestions).getByText('Jo Smith')).toBeInTheDocument()
        expect(within(suggestions).getByText('Jonas')).toBeInTheDocument()
        expect(within(suggestions).queryByText('Ade')).not.toBeInTheDocument()
        await userEvent.keyboard('{ArrowDown}{Enter}')
        expect(byId('a')?.scorer).toBe('Jonas')
        expect(screen.queryByRole('textbox', { name: 'Scorer' })).not.toBeInTheDocument()
    })

    it('should save a new name typed as scorer and add it to the roster', async () => {
        render(<EventLog />)
        await userEvent.dblClick(within(rows()[0]).getByText('Goal'))
        await userEvent.type(screen.getByRole('textbox', { name: 'Scorer' }), 'Kim{Enter}')
        expect(byId('a')?.scorer).toBe('Kim')
        expect(useAppState.getState().teams[1].roster).toContain('Kim')
    })

    it('should cancel the scorer edit on Escape', async () => {
        render(<EventLog />)
        await userEvent.dblClick(within(rows()[0]).getByText('Goal'))
        await userEvent.type(screen.getByRole('textbox', { name: 'Scorer' }), 'Kim{Escape}')
        expect(byId('a')?.scorer).toBeUndefined()
    })

    it('should switch the team from two buttons after double-clicking the team dot', async () => {
        render(<EventLog />)
        await userEvent.dblClick(rows()[0].querySelector('[data-team-dot]')!)
        await userEvent.click(screen.getByRole('button', { name: 'Whites' }))
        expect(byId('a')?.team).toBe('Whites')
    })

    it('should edit the time after double-clicking the timecode', async () => {
        render(<EventLog />)
        await userEvent.dblClick(within(rows()[0]).getByText('00:30'))
        const input = screen.getByRole('textbox', { name: 'Event time' })
        await userEvent.clear(input)
        await userEvent.type(input, '05:00{Enter}')
        expect(byId('a')?.matchTimeSec).toBe(300)
    })
})

describe('EventLog header', () => {
    beforeEach(() => {
        setup([], { currentTimeInFileSec: 42.7 })
    })

    it('should mark an event at the current time and open the picker from + Event', async () => {
        render(<EventLog />)
        await userEvent.click(screen.getByRole('button', { name: /\+ event/i }))
        const [e] = useAppState.getState().events
        expect(e).toMatchObject({ matchTimeSec: 42, sourceFileIndex: 0, type: 'goal' })
        expect(useAppState.getState().picker).toEqual({ eventId: e.id })
        expect(screen.queryByPlaceholderText('00:42')).not.toBeInTheDocument()
    })

    it('should undo and redo from the header buttons', async () => {
        render(<EventLog />)
        await userEvent.click(screen.getByRole('button', { name: /\+ event/i }))
        await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(useAppState.getState().events).toHaveLength(0)
        await userEvent.click(screen.getByRole('button', { name: 'Redo' }))
        expect(useAppState.getState().events).toHaveLength(1)
    })

    it('should reveal the bulk paste box from the menu and add each parsed line', async () => {
        render(<EventLog />)
        expect(screen.queryByRole('textbox', { name: 'Paste list' })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'More' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'Paste list' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Paste list' }), { target: { value: '07:12 Whites - Sam\n23:41 Colours - Jo' } })
        await userEvent.click(screen.getByRole('button', { name: 'Add events' }))
        expect(useAppState.getState().events.map((e) => [e.matchTimeSec, e.team, e.scorer])).toEqual([[432, 'Whites', 'Sam'], [1421, 'Colours', 'Jo']])
        expect(screen.queryByRole('textbox', { name: 'Paste list' })).not.toBeInTheDocument()
    })
})
