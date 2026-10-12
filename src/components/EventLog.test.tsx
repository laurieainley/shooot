// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { toastStore } from '../toasts'
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
const kickOff = (t: number): MatchEvent => ({ id: 'ko', matchTimeSec: t, sourceFileIndex: 0, type: 'kick_off' })
const byId = (id: string): MatchEvent | undefined => useAppState.getState().events.find((e) => e.id === id)
const rows = (): HTMLElement[] => screen.getAllByRole('option')
const log = (): HTMLElement => screen.getByRole('region', { name: 'Events' })

let seekToGoal: ReturnType<typeof vi.fn<(fileIndex: number, timeSec: number) => void>>

function setup(events: MatchEvent[], extra: Partial<ReturnType<typeof useAppState.getState>> = {}): void {
    seekToGoal = vi.fn()
    useAppState.setState({
        files: [vf('a.mp4')], cumulativeOffsets: [0], events, teams,
        lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, currentFileIndex: 0, currentTimeInFileSec: 0,
        undoStack: [], redoStack: [], picker: null, seekToGoal, ...extra,
    })
}

describe('EventLog rows', () => {
    it('should put icon and person in the row, with the full text in the title', () => {
        setup([{ id: 'a', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', team: 'Whites', scorer: 'James', notes: 'long range' }, kickOff(0)])
        render(<EventLog />)
        const [row] = rows()
        expect(within(row).getByRole('img', { name: 'Goal' })).toHaveAttribute('data-icon', 'goal')
        expect(row.querySelector('.event-row__main')).toHaveTextContent('James')
        expect(row.querySelector('.event-row__note')).toHaveTextContent('long range')
        expect(row.querySelector('.event-row__content')).toHaveAttribute('title', expect.stringContaining('Goal · James · long range'))
    })

    it('should show the match clock, label with scorer and the team colour dot', () => {
        setup([{ id: 'a', matchTimeSec: 1521, sourceFileIndex: 0, type: 'goal', pen: true, team: 'Colours', scorer: 'Jo' }, kickOff(100)])
        render(<EventLog />)
        const [row] = rows()
        expect(within(row).getByText('23:41')).toBeInTheDocument()
        expect(within(row).getByRole('img', { name: 'Penalty goal' })).toHaveAttribute('data-icon', 'penalty_goal')
        expect(within(row).getByText('Jo')).toHaveClass('ev-person')
        expect(within(row).getByText('Jo')).not.toHaveClass('voice-shirt')
        expect(row.querySelector('[data-team-dot]')).toHaveStyle({ background: '#c2364a' })
    })

    it('should show file time when no match start is set, and a minus for events before kick-off', () => {
        setup([
            { id: 'a', matchTimeSec: 75, sourceFileIndex: 0, type: 'highlight' },
        ])
        const { unmount } = render(<EventLog />)
        expect(within(rows()[0]).getByText('01:15')).toBeInTheDocument()
        unmount()
        setup([{ id: 'a', matchTimeSec: 70, sourceFileIndex: 0, type: 'highlight' }, kickOff(100)])
        render(<EventLog />)
        expect(within(rows()[0]).getByText('−00:30')).toBeInTheDocument()
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
        expect(screen.getByText(/no goals yet/i)).toBeInTheDocument()
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

    it('should select a clicked row without seeking or playing', async () => {
        render(<EventLog />)
        await userEvent.click(rows()[1])
        expect(rows()[1]).toHaveAttribute('aria-selected', 'true')
        expect(seekToGoal).not.toHaveBeenCalled()
    })

    it('should watch a row from its Watch button: seek to the clip start and play', async () => {
        render(<EventLog />)
        await userEvent.click(within(rows()[1]).getByRole('button', { name: 'Watch' }))
        expect(seekToGoal).toHaveBeenCalledWith(0, 50)
        expect(rows()[1]).toHaveAttribute('aria-selected', 'true')
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

    it('should watch (seek and play) on Enter, remove on Delete or Backspace, and toggle replay on R', () => {
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

    it('should show a Slow-mo replay switch that is on for goals and off otherwise', async () => {
        render(<EventLog />)
        await userEvent.click(rows()[0])
        expect(screen.getByRole('switch', { name: 'Slow-mo replay' })).toBeChecked()
        await userEvent.click(rows()[1])
        expect(screen.getByRole('switch', { name: 'Slow-mo replay' })).not.toBeChecked()
    })

    it('should show a passive replay glyph in the row, not a button, only while the replay is on', async () => {
        render(<EventLog />)
        const glyph = (i: number): Element | null => rows()[i].querySelector('.event-row__replay')
        expect(glyph(0)).not.toBeNull()
        expect(glyph(0)).toHaveTextContent('slow-mo replay')
        expect(glyph(0)?.closest('button')).toBeNull()
        expect(glyph(0)).toHaveAttribute('title', 'Slow-mo replay on')
        expect(glyph(1)).toBeNull()
        await userEvent.click(rows()[1])
        await userEvent.click(screen.getByRole('switch', { name: 'Slow-mo replay' }))
        expect(glyph(1)).not.toBeNull()
    })

    it('should flip the effective replay setting when clicked, without seeking', async () => {
        render(<EventLog />)
        await userEvent.click(rows()[0])
        await userEvent.click(screen.getByRole('switch', { name: 'Slow-mo replay' }))
        await userEvent.click(rows()[1])
        await userEvent.click(screen.getByRole('switch', { name: 'Slow-mo replay' }))
        expect(byId('g')?.replay).toBe(false)
        expect(byId('h')?.replay).toBe(true)
        expect(seekToGoal).not.toHaveBeenCalled()
    })

    it('should delete an event from its action row', async () => {
        render(<EventLog />)
        await userEvent.click(rows()[0])
        await userEvent.click(screen.getByRole('button', { name: 'Delete event' }))
        expect(byId('g')).toBeUndefined()
        const toast = toastStore.getState().toast
        expect(toast?.text).toMatch(/^Goal at .* deleted$/)
        act(() => { toast?.action?.run() })
        expect(byId('g')).toBeDefined() // Undo brings it back
    })
})

describe('EventLog delete toast', () => {
    it('should not undo a later change when its Undo is used after something else happened', async () => {
        setup([{ id: 'g', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', team: 'Whites' }, { id: 'h', matchTimeSec: 200, sourceFileIndex: 0, type: 'highlight' }, kickOff(0)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        await userEvent.click(screen.getByRole('button', { name: 'Delete event' }))
        const toast = toastStore.getState().toast
        act(() => { useAppState.getState().updateEvent('h', { replay: true }) }) // a later, non-toasting change
        act(() => { toast?.action?.run() })
        expect(byId('g')).toBeUndefined() // the delete was not undone
        expect(byId('h')?.replay).toBe(true) // and the later change stayed
    })
})

describe('EventLog undo of a discard', () => {
    it('should enable Undo for a pending discard and undo it like ⌘Z', () => {
        setup([kickOff(0)], { panel: null })
        useAppState.setState({ suggestions: [], suggestionRun: null })
        useAppState.getState().setSuggestions({ createdAt: 1, source: 'audio', configVersion: 1, analysedSec: 600, total: 1 }, [{ timeSec: 100, score: 3 }])
        useAppState.setState({ undoStack: [] })
        render(<EventLog />)
        expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
        act(() => { useAppState.getState().decideSuggestion(useAppState.getState().suggestions[0].id, { kind: 'reject' }) })
        expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(useAppState.getState().suggestions[0].status).toBe('pending')
    })
})

describe('EventLog review button', () => {
    const run = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 3 }
    const files = [vf('a.mp4')]
    beforeEach(() => {
        setup([kickOff(0)], { panel: null })
        useAppState.setState({ suggestions: [], suggestionRun: null })
        useAppState.getState().setSuggestions({ ...run, fileKeys: undefined }, [{ timeSec: 100, score: 3 }, { timeSec: 200, score: 3 }, { timeSec: 300, score: 3 }])
        useAppState.setState({ files, panel: null })
    })
    it('should offer Review suggestions with the number left, and open the review at the first one', () => {
        useAppState.getState().decideSuggestion(useAppState.getState().suggestions[0].id, { kind: 'reject' })
        useAppState.getState().setSuggestionBall(useAppState.getState().suggestions[2].id, { goal: 'team1', frames: 2 })
        render(<EventLog />)
        fireEvent.click(screen.getByRole('button', { name: 'Review suggestions (2 left · 1 top pick)' }))
        const st = useAppState.getState()
        expect(st.panel).toBe('review')
        expect(st.reviewIndex).toBe(2) // Top picks first
    })
    it('should not show when nothing is left or the review is open', () => {
        for (const x of useAppState.getState().suggestions) useAppState.getState().decideSuggestion(x.id, { kind: 'reject' })
        const { rerender } = render(<EventLog />)
        expect(screen.queryByRole('button', { name: /^Review suggestions/ })).toBeNull()
        useAppState.getState().restoreSuggestion(useAppState.getState().suggestions[0].id)
        rerender(<EventLog />)
        expect(screen.getByRole('button', { name: 'Review suggestions (1 left)' })).toBeTruthy()
        act(() => { useAppState.setState({ panel: 'review' }) })
        expect(screen.queryByRole('button', { name: /^Review suggestions/ })).toBeNull()
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
        expect(within(rows()[0]).getByRole('img', { name: 'Highlight' })).toHaveAttribute('data-icon', 'highlight')
        expect(within(rows()[0]).getByText('Sam')).toBeInTheDocument()
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

    it('should mark an event at the current time and open the picker from + Tag event', async () => {
        render(<EventLog />)
        await userEvent.click(screen.getByRole('button', { name: /\+ tag event/i }))
        const [e] = useAppState.getState().events
        expect(e).toMatchObject({ matchTimeSec: 42, sourceFileIndex: 0, type: 'goal' })
        expect(useAppState.getState().picker).toEqual({ eventId: e.id, fresh: true })
        expect(screen.queryByPlaceholderText('00:42')).not.toBeInTheDocument()
    })

    it('should select a newly marked event', async () => {
        render(<EventLog />)
        await userEvent.click(screen.getByRole('button', { name: /\+ tag event/i }))
        expect(rows()[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('should undo and redo from the header buttons', async () => {
        render(<EventLog />)
        await userEvent.click(screen.getByRole('button', { name: /\+ tag event/i }))
        await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
        expect(useAppState.getState().events).toHaveLength(0)
        await userEvent.click(screen.getByRole('button', { name: 'Redo' }))
        expect(useAppState.getState().events).toHaveLength(1)
    })

    it('should keep only + Tag event, undo, redo and the shortcuts button in the header (the rest lives in the top-bar menu)', () => {
        render(<EventLog />)
        const header = log().querySelector('header')!
        expect(within(header).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['+ Tag event', 'Undo', 'Redo', 'Keyboard shortcuts'])
    })
})

describe('EventLog empty state', () => {
    it('should tell touch users to tap ＋', () => {
        setCoarsePointer(true)
        setup([])
        render(<EventLog />)
        expect(screen.getByText(/no goals yet/i).closest('p')).toHaveTextContent('No goals yet. Classic. Tap ＋ while the video plays.')
    })

    it('should tell keyboard users to press G', () => {
        setCoarsePointer(false)
        setup([])
        render(<EventLog />)
        expect(screen.getByText(/no goals yet/i).closest('p')).toHaveTextContent('No goals yet. Classic. Press G while it plays.')
    })
})

describe('EventLog find goals', () => {
    beforeEach(() => { useAppState.setState({ suggestions: [], suggestionRun: null, panel: null }) })
    it('should offer Find goals in the empty state when videos are loaded', () => {
        setup([])
        render(<EventLog />)
        expect(screen.getByRole('button', { name: /Find goals/ })).toHaveTextContent('Beta')
    })

    it('should not offer it without videos', () => {
        setup([], { files: [], cumulativeOffsets: [] })
        render(<EventLog />)
        expect(screen.queryByRole('button', { name: /Find goals/ })).toBeNull()
    })
})

describe('EventLog on touch screens', () => {
    beforeEach(() => {
        setCoarsePointer(true)
        setup([
            { id: 'a', matchTimeSec: 30, sourceFileIndex: 0, type: 'goal' },
            { id: 'b', matchTimeSec: 60, sourceFileIndex: 0, type: 'highlight' },
        ], { panel: null, editingEventId: null })
    })
    afterEach(() => setCoarsePointer(false))

    it('should expand a tapped row instead of opening the edit sheet, without seeking or playing', async () => {
        render(<EventLog />)
        await userEvent.click(rows()[1])
        expect(seekToGoal).not.toHaveBeenCalled()
        expect(useAppState.getState().panel).toBeNull()
        expect(within(rows()[1]).getByRole('group', { name: 'Event actions' })).toBeInTheDocument()
    })

    it('should watch from the row button on touch without opening the editor', async () => {
        render(<EventLog />)
        await userEvent.click(within(rows()[1]).getByRole('button', { name: 'Watch' }))
        expect(seekToGoal).toHaveBeenCalledWith(0, 50)
        expect(useAppState.getState().panel).toBeNull()
    })

    it('should open the edit sheet from the action row Edit button', async () => {
        render(<EventLog />)
        await userEvent.click(rows()[0])
        await userEvent.click(screen.getByRole('button', { name: 'Edit details' }))
        expect(useAppState.getState()).toMatchObject({ panel: 'event', editingEventId: 'a' })
    })

    it('should make action buttons touch-sized and keep the row free of replay and delete buttons', async () => {
        render(<EventLog />)
        expect(within(rows()[0]).queryByRole('switch')).not.toBeInTheDocument()
        await userEvent.click(rows()[0])
        expect(screen.getByRole('button', { name: 'Delete event' })).toHaveClass('act-btn--touch')
    })

    it('should leave marking to the ＋ button: no "+ Tag event" in the header', () => {
        render(<EventLog />)
        const header = log().querySelector('header')!
        expect(within(header).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Undo', 'Redo'])
    })

    it('should keep inline editing for mouse users (no sheet on click)', async () => {
        setCoarsePointer(false)
        render(<EventLog />)
        await userEvent.click(rows()[0])
        expect(useAppState.getState().panel).toBeNull()
    })
})

describe('EventLog — match markers', () => {
    it('should show Kick off and Final whistle as distinct flag rows without replay, score or team', () => {
        setup([
            { id: 'ko', matchTimeSec: 60, sourceFileIndex: 0, type: 'kick_off' },
            { id: 'g', matchTimeSec: 120, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
            { id: 'fw', matchTimeSec: 3000, sourceFileIndex: 0, type: 'final_whistle' },
        ])
        render(<EventLog />)
        const [ko, , fw] = rows()
        expect(ko).toHaveClass('event-row--marker')
        expect(within(ko).getByText('Kick off')).toBeInTheDocument()
        expect(within(ko).getByText('00:00')).toBeInTheDocument()
        expect(within(fw).getByText('Final whistle')).toBeInTheDocument()
        expect(within(fw).getByText('49:00')).toBeInTheDocument()
        for (const r of [ko, fw]) {
            expect(within(r).queryByRole('switch')).not.toBeInTheDocument()
            expect(r.querySelector('.event-row__replay')).toBeNull()
            expect(r.querySelector('[data-team-dot]')).toBeNull()
            expect(r.querySelector('[data-score]')).toBeNull()
        }
    })

    it('should jump to the marker itself (not a clip start) on Watch, and only select it when clicked', async () => {
        setup([{ id: 'ko', matchTimeSec: 60, sourceFileIndex: 0, type: 'kick_off' }])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        expect(seekToGoal).not.toHaveBeenCalled()
        await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Watch' }))
        expect(seekToGoal).toHaveBeenCalledWith(0, 60)
    })
})

describe('EventLog action row', () => {
    const goal = (id: string, t: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', team: 'Whites', scorer: 'James', ...extra })

    it('should show no assist and no file tag in the row', () => {
        setup([goal('a', 100, { assist: 'Joe', notes: 'top corner' })], { files: [vf('a.mp4'), vf('b.mp4')], cumulativeOffsets: [0, 600] })
        render(<EventLog />)
        const [row] = rows()
        expect(row).not.toHaveTextContent('Assist')
        expect(row.querySelector('.row-file')).toBeNull()
        expect(row.querySelector('.event-row__note')).toHaveTextContent('top corner')
    })

    it('should expand only the selected row', async () => {
        setup([goal('a', 100), goal('b', 200)])
        render(<EventLog />)
        expect(screen.queryByRole('group', { name: 'Event actions' })).toBeNull()
        await userEvent.click(rows()[0])
        expect(within(rows()[0]).getByRole('group', { name: 'Event actions' })).toBeInTheDocument()
        await userEvent.click(rows()[1])
        expect(within(rows()[0]).queryByRole('group', { name: 'Event actions' })).toBeNull()
        expect(within(rows()[1]).getByRole('group', { name: 'Event actions' })).toBeInTheDocument()
    })

    it('should toggle replay, open edit and delete from the action row', async () => {
        setup([goal('a', 100), goal('b', 200)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        const actions = within(rows()[0]).getByRole('group', { name: 'Event actions' })
        await userEvent.click(within(actions).getByRole('switch', { name: 'Slow-mo replay' }))
        expect(byId('a')?.replay).toBe(false)
        await userEvent.click(within(actions).getByRole('button', { name: /edit/i }))
        expect(useAppState.getState()).toMatchObject({ panel: 'event', editingEventId: 'a' })
        await userEvent.click(within(actions).getByRole('button', { name: /delete/i }))
        expect(byId('a')).toBeUndefined()
    })

    it('should order the action row: replay switch, Edit, Framing, Download, Delete', async () => {
        setup([goal('a', 100)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        const actions = within(rows()[0]).getByRole('group', { name: 'Event actions' })
        expect(Array.from(actions.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))).toEqual(['Slow-mo replay', 'Edit details', 'Replay framing', 'Download clip', 'Delete event'])
    })

    it('should open the details view from Edit and only the framing view from Framing', async () => {
        setup([goal('a', 100)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        await userEvent.click(screen.getByRole('button', { name: 'Edit details' }))
        expect(useAppState.getState()).toMatchObject({ panel: 'event', editingEventId: 'a', editingView: 'details' })
        await userEvent.click(screen.getByRole('button', { name: 'Replay framing' }))
        expect(useAppState.getState()).toMatchObject({ panel: 'event', editingEventId: 'a', editingView: 'framing' })
    })

    it('should scroll only the list (never the page) to show an expanded row, without smoothing when motion is reduced', async () => {
        setup([goal('a', 100)])
        const pageScroll = vi.fn()
        Element.prototype.scrollIntoView = pageScroll
        const listScroll = vi.fn()
        const rect = Element.prototype.getBoundingClientRect
        Element.prototype.getBoundingClientRect = function (this: Element) {
            const box = this.getAttribute('role') === 'listbox' ? { top: 0, bottom: 100 } : { top: 150, bottom: 200 }
            return { ...box, left: 0, right: 100, width: 100, height: box.bottom - box.top, x: 0, y: box.top, toJSON: () => ({}) } as DOMRect
        }
        const mm = window.matchMedia
        window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
        try {
            render(<EventLog />)
            const list = screen.getByRole('listbox', { name: 'Event list' })
            list.scrollTo = listScroll as never
            Object.defineProperty(list, 'scrollHeight', { value: 300, configurable: true })
            Object.defineProperty(list, 'clientHeight', { value: 100, configurable: true })
            await userEvent.click(rows()[0])
            expect(listScroll).toHaveBeenCalledWith({ top: 100, behavior: 'auto' })
            expect(pageScroll).not.toHaveBeenCalled()
        } finally { window.matchMedia = mm; Element.prototype.getBoundingClientRect = rect }
    })

    it('should scroll the page to an expanded row when the list itself does not scroll (phone portrait)', async () => {
        setup([goal('a', 100)])
        const pageScroll = vi.fn()
        Element.prototype.scrollIntoView = pageScroll
        render(<EventLog />)
        await userEvent.click(rows()[0])
        expect(pageScroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }))
    })

    it('should show Framing only while the replay is on', async () => {
        setup([goal('a', 100, { replay: false })])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        expect(within(rows()[0]).queryByRole('button', { name: /framing/i })).toBeNull()
    })

    it('should give marker rows only Edit and Delete', async () => {
        setup([kickOff(0)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        const actions = within(rows()[0]).getByRole('group', { name: 'Event actions' })
        expect(within(actions).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Edit details', 'Delete event'])
    })

    it('should collapse on Esc and keep focus in the log', async () => {
        setup([goal('a', 100)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        log().focus()
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('group', { name: 'Event actions' })).toBeNull()
        expect(log()).toHaveFocus()
    })

    it('should not delete the event when Backspace is typed in an open note field', async () => {
        setup([goal('a', 100, { notes: 'abc' })])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        log().focus()
        await userEvent.keyboard('n')
        const input = screen.getByRole('textbox', { name: 'Note' })
        await userEvent.type(input, '{Backspace}')
        expect(byId('a')).toBeDefined()
        expect(within(rows()[0]).getByRole('group', { name: 'Event actions' })).toBeInTheDocument()
    })

    it('should still open the action row for an unlinked event', async () => {
        setup([goal('a', 100, { unlinked: true, sourceFileKey: 'gone.mp4' })])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        expect(within(rows()[0]).getByRole('group', { name: 'Event actions' })).toBeInTheDocument()
        expect(within(rows()[0]).getByRole('button', { name: 'Watch' })).toBeDisabled()
    })

    it('should activate a focused action button with Enter without watching', async () => {
        setup([goal('a', 100)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        within(rows()[0]).getByRole('button', { name: 'Edit details' }).focus()
        await userEvent.keyboard('{Enter}')
        expect(useAppState.getState()).toMatchObject({ panel: 'event', editingEventId: 'a' })
        expect(seekToGoal).not.toHaveBeenCalled()
    })

    it('should collapse on Esc from an action button and keep focus in the log; a second Esc blurs it', async () => {
        setup([goal('a', 100)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        within(rows()[0]).getByRole('button', { name: 'Delete event' }).focus()
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('group', { name: 'Event actions' })).toBeNull()
        expect(log()).toHaveFocus()
        await userEvent.keyboard('{Escape}')
        expect(log()).not.toHaveFocus()
    })

    it('should render the download slot when given one (Part B)', async () => {
        const { EventActions } = await import('./EventActions')
        render(<EventActions event={goal('a', 1)} touch={false} onToggleReplay={() => undefined} onFraming={() => undefined}
            onEdit={() => undefined} onRemove={() => undefined} download={<button type="button">Dl</button>} />)
        expect(screen.getByRole('button', { name: 'Dl' }).parentElement).toHaveClass('event-actions__download')
    })
})

describe('EventLog with the clip popover open', () => {
    it('should ignore keys pressed inside the portalled popover', async () => {
        setup([{ id: 'a', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', team: 'Whites' }, kickOff(0)])
        render(<EventLog />)
        await userEvent.click(rows()[0])
        await userEvent.click(screen.getByRole('button', { name: 'Download clip' }))
        const dialog = screen.getByRole('dialog', { name: 'Download clip' })
        dialog.focus()
        const before = byId('a')?.replay
        await userEvent.keyboard('{Delete}')
        await userEvent.keyboard('r')
        expect(byId('a')).toBeDefined()
        expect(byId('a')?.replay).toBe(before)
    })
})

describe('EventLog find goals prompt', () => {
    beforeEach(() => { useAppState.setState({ suggestions: [], suggestionRun: null, panel: null }) })
    const marker = (id: string, type: 'kick_off' | 'half_time'): MatchEvent => ({ id, matchTimeSec: 1, sourceFileIndex: 0, type })

    it('should offer Find goals when only markers exist', () => {
        setup([marker('k', 'kick_off'), marker('h', 'half_time')])
        render(<EventLog />)
        expect(screen.getByRole('button', { name: /Find goals/ })).toHaveTextContent('Beta')
    })

    it('should hide once a goal exists', () => {
        setup([marker('k', 'kick_off'), { id: 'g', matchTimeSec: 5, sourceFileIndex: 0, type: 'goal', team: 'Whites' }])
        render(<EventLog />)
        expect(screen.queryByTestId('find-prompt')).toBeNull()
    })

    it('should hide without videos', () => {
        setup([marker('k', 'kick_off')], { files: [], cumulativeOffsets: [] })
        render(<EventLog />)
        expect(screen.queryByTestId('find-prompt')).toBeNull()
    })
})
