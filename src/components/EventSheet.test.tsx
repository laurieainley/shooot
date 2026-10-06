// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { MatchEvent, Team, VideoSourceFile } from '../types'
import { EventSheet } from './EventSheet'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full' })
const teams: Team[] = [
    { name: 'Whites', color: '#3a6ea5', roster: ['Sam Taylor', 'Priya'] },
    { name: 'Colours', color: '#c2364a', roster: ['Jo Smith', 'Ade'] },
]
const ev = (): MatchEvent | undefined => useAppState.getState().events.find((e) => e.id === 'a')
let seekToGoal: ReturnType<typeof vi.fn<(fileIndex: number, timeSec: number) => void>>

function setup(event: Partial<MatchEvent> = {}): void {
    seekToGoal = vi.fn()
    useAppState.setState({
        files: [vf('a.mp4')], cumulativeOffsets: [0], teams, lengthBeforeGoalSec: 10,
        events: [{ id: 'a', matchTimeSec: 95, sourceFileIndex: 0, type: 'goal', team: 'Whites', scorer: 'Sam Taylor', ...event }],
        undoStack: [], redoStack: [], picker: null, panel: 'event', editingEventId: 'a', seekToGoal,
    })
    render(<EventSheet />)
}
const pressed = (name: RegExp | string): HTMLElement => screen.getByRole('button', { name, pressed: true })

describe('EventSheet', () => {
    beforeEach(() => setup())

    it('should show the event time and its current type, team and person', () => {
        expect(screen.getByRole('dialog', { name: 'Edit event' })).toHaveTextContent('01:35')
        expect(pressed(/^Goal$/)).toBeInTheDocument()
        expect(pressed('Whites')).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Scorer' })).toHaveValue('Sam Taylor')
    })

    it('should change the type and relabel the person field', async () => {
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(ev()).toMatchObject({ type: 'save', pen: undefined, scorer: 'Sam Taylor' })
        expect(screen.getByRole('textbox', { name: 'Goalkeeper' })).toBeInTheDocument()
    })

    it('should hide the person field for a type without one', async () => {
        await userEvent.click(screen.getByRole('button', { name: 'Penalty awarded' }))
        expect(ev()?.scorer).toBeUndefined()
        expect(screen.queryByRole('textbox', { name: /scorer|taker/i })).not.toBeInTheDocument()
    })

    it('should change the team, and clear it with None', async () => {
        await userEvent.click(screen.getByRole('button', { name: 'Colours' }))
        expect(ev()?.team).toBe('Colours')
        await userEvent.click(screen.getByRole('button', { name: 'No team' }))
        expect(ev()?.team).toBeUndefined()
    })

    it('should pick the person from the roster of the credited team', async () => {
        await userEvent.click(within(screen.getByRole('group', { name: 'Scorer' })).getByRole('button', { name: 'Priya' }))
        expect(ev()?.scorer).toBe('Priya')
        expect(screen.getByRole('textbox', { name: 'Scorer' })).toHaveValue('Priya')
    })

    it('should save a typed person and add them to the roster on Enter', async () => {
        const box = screen.getByRole('textbox', { name: 'Scorer' })
        await userEvent.clear(box)
        await userEvent.type(box, 'Kim{Enter}')
        expect(ev()?.scorer).toBe('Kim')
        expect(useAppState.getState().teams[0].roster).toContain('Kim')
    })

    it('should add a note, saved when Done is tapped', async () => {
        await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), 'top corner')
        await userEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(ev()?.notes).toBe('top corner')
        expect(useAppState.getState().panel).toBeNull()
    })

    it('should keep typed text when the sheet is closed with ×', async () => {
        await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), 'header')
        await userEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(ev()?.notes).toBe('header')
    })

    it('should toggle the slow-mo replay', async () => {
        const toggle = screen.getByRole('checkbox', { name: /replay/i })
        expect(toggle).toBeChecked()
        await userEvent.click(toggle)
        expect(ev()?.replay).toBe(false)
    })

    it('should delete the event and close', async () => {
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
        expect(ev()).toBeUndefined()
        expect(useAppState.getState().panel).toBeNull()
    })

    it('should jump to the clip and close with Watch', async () => {
        await userEvent.click(screen.getByRole('button', { name: 'Watch' }))
        expect(seekToGoal).toHaveBeenCalledWith(0, 85)
        expect(useAppState.getState().panel).toBeNull()
    })

    it('should undo every change in one step per change', async () => {
        await userEvent.click(screen.getByRole('button', { name: 'Colours' }))
        useAppState.getState().undo()
        expect(ev()?.team).toBe('Whites')
    })
})

describe('EventSheet — match markers', () => {
    it('should offer only time, type and delete for a Kick off', () => {
        setup({ type: 'kick_off', team: undefined, scorer: undefined })
        expect(pressed('Kick off')).toBeInTheDocument()
        expect(screen.queryByRole('group', { name: 'Team' })).not.toBeInTheDocument()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.queryByRole('checkbox', { name: /replay/i })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    it('should make an event the Final whistle, moving an existing one', async () => {
        setup()
        useAppState.setState({ events: [...useAppState.getState().events, { id: 'old', matchTimeSec: 500, sourceFileIndex: 0, type: 'final_whistle' }] })
        await userEvent.click(screen.getByRole('button', { name: 'Final whistle' }))
        const st = useAppState.getState()
        expect(ev()).toMatchObject({ type: 'final_whistle' })
        expect(ev()?.team).toBeUndefined()
        expect(st.events.some((e) => e.id === 'old')).toBe(false)
    })
})

describe('EventSheet assist', () => {
    it('should show an Assist field with the scoring team roster minus the scorer, and set / clear it', async () => {
        setup({ scorer: 'Sam Taylor' })
        expect(screen.getByRole('textbox', { name: 'Assist' })).toHaveValue('')
        const chips = screen.getByRole('group', { name: 'Assist' }) as HTMLElement
        expect(chips).toHaveTextContent('Priya')
        expect(chips).not.toHaveTextContent('Sam Taylor')
        await userEvent.click(within(chips).getByRole('button', { name: 'Priya' }))
        expect(ev()?.assist).toBe('Priya')
        await userEvent.clear(screen.getByRole('textbox', { name: 'Assist' }))
        await userEvent.keyboard('{Enter}')
        expect(ev()?.assist).toBeUndefined()
    })

    it('should add a typed new assist to the roster', async () => {
        setup({ scorer: 'Sam Taylor' })
        await userEvent.type(screen.getByRole('textbox', { name: 'Assist' }), 'Newbie{Enter}')
        expect(ev()?.assist).toBe('Newbie')
        expect(useAppState.getState().teams[0].roster).toContain('Newbie')
    })

    it('should not show the field for penalty goals and own goals, and drop the assist on a type change', async () => {
        setup({ assist: 'Priya' })
        await userEvent.click(screen.getByRole('button', { name: 'Penalty goal' }))
        expect(ev()?.assist).toBeUndefined()
        expect(screen.queryByRole('textbox', { name: 'Assist' })).not.toBeInTheDocument()
    })
})
