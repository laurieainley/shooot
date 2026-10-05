// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { EventLog } from './EventLog'
import { setCoarsePointer } from '../test/pointer'
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

describe('EventLog details & running score', () => {
    it('should show the score after each scoring event in timeline order, and none on other rows', () => {
        setup([
            { id: 'a', matchTimeSec: 30, type: 'goal', team: 'Whites' },
            { id: 'b', matchTimeSec: 60, type: 'highlight', team: 'Whites' },
            { id: 'c', matchTimeSec: 90, type: 'own_goal', team: 'Colours', scorer: 'Sam Taylor' },
            { id: 'd', matchTimeSec: 120, type: 'goal', team: 'Colours' },
        ])
        render(<EventLog />)
        const score = (i: number): string | null => rows()[i].querySelector('[data-score]')?.textContent ?? null
        expect([score(0), score(1), score(2), score(3)]).toEqual(['1–0', null, '1–1', '1–2'])
    })

    it('should show the person and a shortened note', () => {
        setup([{ id: 'a', matchTimeSec: 30, type: 'highlight', team: 'Whites', scorer: 'Sam', notes: 'nutmeg on the wing' }])
        render(<EventLog />)
        expect(within(rows()[0]).getByText('Highlight · Sam')).toBeInTheDocument()
        expect(within(rows()[0]).getByText('nutmeg on the wing')).toBeInTheDocument()
    })

    it('should edit the note with N and save on Enter', async () => {
        setup([{ id: 'a', matchTimeSec: 30, type: 'foul', team: 'Whites' }])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        log().focus()
        fireEvent.keyDown(log(), { key: 'n' })
        const input = screen.getByRole('textbox', { name: 'Note' })
        await userEvent.type(input, 'late tackle{Enter}')
        expect(byId('a')?.notes).toBe('late tackle')
        expect(screen.queryByRole('textbox', { name: 'Note' })).not.toBeInTheDocument()
    })

    it('should edit the note on double-click, clear it when emptied and cancel on Escape', async () => {
        setup([{ id: 'a', matchTimeSec: 30, type: 'highlight', notes: 'header' }])
        render(<EventLog />)
        await userEvent.dblClick(within(rows()[0]).getByText('header'))
        await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), 'xx{Escape}')
        expect(byId('a')?.notes).toBe('header')
        await userEvent.dblClick(within(rows()[0]).getByText('header'))
        await userEvent.clear(screen.getByRole('textbox', { name: 'Note' }))
        await userEvent.keyboard('{Enter}')
        expect(byId('a')?.notes).toBeUndefined()
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

    it('should select a newly marked event', async () => {
        render(<EventLog />)
        await userEvent.click(screen.getByRole('button', { name: /\+ event/i }))
        expect(rows()[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('should undo and redo from the header buttons', async () => {
        render(<EventLog />)
        await userEvent.click(screen.getByRole('button', { name: /\+ event/i }))
        await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(useAppState.getState().events).toHaveLength(0)
        await userEvent.click(screen.getByRole('button', { name: 'Redo' }))
        expect(useAppState.getState().events).toHaveLength(1)
    })

    it('should keep only + Event, undo and redo in the header (the rest lives in the top-bar menu)', () => {
        render(<EventLog />)
        const header = log().querySelector('header')!
        expect(within(header).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['+ Event', 'Undo', 'Redo'])
    })
})

describe('EventLog empty state', () => {
    it('should tell touch users to tap ＋', () => {
        setCoarsePointer(true)
        setup([])
        render(<EventLog />)
        expect(screen.getByText(/no events yet/i)).toHaveTextContent('No events yet. Tap ＋ while the video plays.')
    })

    it('should tell keyboard users to press G', () => {
        setCoarsePointer(false)
        setup([])
        render(<EventLog />)
        expect(screen.getByText(/no events yet/i)).toHaveTextContent('No events yet. Press G while it plays.')
    })
})
