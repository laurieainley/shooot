// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within, cleanup } from '@testing-library/react'
import { useAppState } from '../state'
import { dismissToast, toastStore } from '../toasts'
import { setReviewWindow } from './reviewWindowState'
import { EventPicker } from './EventPicker'
import { setCoarsePointer } from '../test/pointer'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full' })
const press = (key: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) })
const s = () => useAppState.getState()

describe('EventPicker', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, undoStack: [], redoStack: [], picker: null,
            teams: [{ name: 'Whites', color: '#fff', roster: ['Sam Taylor', 'Sandy Wu'] }, { name: 'Colours', color: '#f00', roster: ['Jo'] }],
        })
        act(() => s().markEvent(100))
    })

    it('should show the type list with Goal highlighted', () => {
        render(<EventPicker />)
        expect(screen.getByRole('option', { name: /goal ⏎/i })).toHaveAttribute('aria-selected', 'true')
    })

    it('should record goal → team → scorer from the keyboard', () => {
        render(<EventPicker />)
        press('Enter')
        press('w')
        fireEvent.change(screen.getByRole('textbox', { name: /scorer/i }), { target: { value: 'sa' } })
        press('ArrowDown')
        press('Enter')
        expect(s().events[0]).toMatchObject({ type: 'goal', team: 'Whites', scorer: 'Sandy Wu' })
        press('Tab') // the optional assist step
        expect(s().picker).not.toBeNull() // the optional note step
        press('Enter')
        expect(s().picker).toBeNull()
    })

 it('should ask for an optional assist after the scorer, listing the team with the scorer disabled', () => {
        render(<EventPicker />)
        press('Enter')
        press('w')
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        expect(s().picker).not.toBeNull()
        expect(screen.getByRole('textbox', { name: 'Assist' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: /sandy wu/i })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: /sam taylor/i })).toHaveAttribute('aria-disabled', 'true')
        press('Enter')
        expect(s().events[0]).toMatchObject({ type: 'goal', team: 'Whites', scorer: 'Sam Taylor', assist: 'Sandy Wu' })
        press('Enter') // empty note
        expect(s().picker).toBeNull()
    })

    it('should leave no assist on Escape or Skip, and add a new typed name to the roster', () => {
        render(<EventPicker />)
        press('Enter'); press('w')
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        press('Escape')
        expect(s().events[0].assist).toBeUndefined()
        expect(s().picker).toBeNull()

        act(() => s().markEvent(300))
        const id = s().events.find((e) => e.matchTimeSec === 300)!.id
        act(() => s().openPicker(id))
        press('Enter'); press('w')
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        fireEvent.click(screen.getByRole('button', { name: /skip/i }))
        expect(s().events.find((e) => e.id === id)!.assist).toBeUndefined()

        act(() => s().markEvent(500))
        const id2 = s().events.find((e) => e.matchTimeSec === 500)!.id
        act(() => s().openPicker(id2))
        press('Enter'); press('w')
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Assist' }), { target: { value: 'Newbie' } })
        press('Enter')
        expect(s().events.find((e) => e.id === id2)!.assist).toBe('Newbie')
        expect(s().teams[0].roster).toContain('Newbie')
    })

    it('should not ask for an assist after a penalty goal', () => {
        render(<EventPicker />)
        press('p'); press('w')
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        expect(screen.queryByRole('textbox', { name: 'Assist' })).not.toBeInTheDocument()
        press('Enter') // empty note
        expect(s().picker).toBeNull()
    })

    it('should offer the assist step on touch too, as name chips with the scorer disabled', () => {
        setCoarsePointer(true)
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^goal/i }))
        fireEvent.click(screen.getByRole('option', { name: /whites/i }))
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument() // chips, not a typed field
        fireEvent.click(screen.getByRole('button', { name: 'Sam Taylor' }))
        expect(screen.getByRole('group', { name: 'Assist' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Sam Taylor' })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: 'Sandy Wu' }))
        expect(s().events[0].assist).toBe('Sandy Wu')
        expect(s().picker).toBeNull() // no optional note step on touch
        setCoarsePointer(false)
    })

    it('should skip the assist with "No assist" and add a new name only through + New name on touch', () => {
        setCoarsePointer(true)
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^goal/i }))
        fireEvent.click(screen.getByRole('option', { name: /whites/i }))
        fireEvent.click(screen.getByRole('button', { name: '+ New name' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Scorer' }), { target: { value: 'Kit' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        expect(s().events[0]).toMatchObject({ scorer: 'Kit' })
        expect(s().teams[0].roster).toContain('Kit')
        fireEvent.click(screen.getByRole('button', { name: 'No assist' }))
        expect(s().events[0].assist).toBeUndefined()
        expect(screen.getByRole('textbox', { name: 'Note' })).toBeInTheDocument() // on to the note
        setCoarsePointer(false)
    })

    it('should make a highlight with H and ask for the team, with a Skip option', () => {
        render(<EventPicker />)
        press('h')
        expect(s().events[0].type).toBe('highlight')
        expect(s().picker).not.toBeNull()
        expect(screen.getByRole('option', { name: /whites/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
        press('Escape')
        expect(s().picker).toBeNull()
        expect(s().events[0].type).toBe('highlight')
    })

    it('should label the person step per type', () => {
        render(<EventPicker />)
        press('p')
        press('w')
        expect(screen.getByRole('textbox', { name: 'Penalty taker' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument()
    })

    it('should offer the goalkeeper as optional on a save', () => {
        render(<EventPicker />)
        press('s')
        press('c')
        expect(screen.getByRole('textbox', { name: 'Goalkeeper' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /skip/i }))
        press('Enter') // empty note
        expect(s().picker).toBeNull()
        expect(s().events[0]).toMatchObject({ type: 'save', team: 'Colours' })
        expect(s().events[0].scorer).toBeUndefined()
    })

    it('should record highlight → team → who → what happened', () => {
        render(<EventPicker />)
        press('h')
        press('w')
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        const box = screen.getByRole('textbox', { name: 'What happened' })
        expect(document.activeElement).toBe(box)
        fireEvent.change(box, { target: { value: 'nutmeg on the wing' } })
        press('Enter')
        expect(s().events[0]).toMatchObject({ type: 'highlight', team: 'Whites', scorer: 'Sam Taylor', notes: 'nutmeg on the wing' })
        expect(s().picker).toBeNull()
    })

    it('should delete the new event on Backspace', () => {
        render(<EventPicker />)
        press('Backspace')
        expect(s().events).toEqual([])
    })

    it('should support tapping chips', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /own goal/i }))
        fireEvent.click(screen.getByRole('option', { name: /colours/i }))
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        expect(s().events[0]).toMatchObject({ type: 'own_goal', team: 'Colours', scorer: 'Sam Taylor' })
    })

    it('should stop other keydown listeners while open', () => {
        let leaked = 0
        const spy = () => { leaked++ }
        document.addEventListener('keydown', spy)
        render(<EventPicker />)
        // dispatch below window so the window capture-phase listener runs before the document listener
        act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true })) })
        document.removeEventListener('keydown', spy)
        expect(leaked).toBe(0)
    })

    it('should give keyboard focus back to the player after the scorer step', () => {
        const playerEl = document.createElement('div')
        playerEl.tabIndex = -1
        document.body.appendChild(playerEl)
        playerEl.focus()
        render(<EventPicker />)
        press('Enter')
        press('w')
        expect(document.activeElement).toBe(screen.getByRole('textbox', { name: /scorer/i }))
        press('Enter')
        press('Tab') // past the optional assist step
        press('Escape') // and the optional note
        expect(s().picker).toBeNull()
        expect(document.activeElement).toBe(playerEl)
        playerEl.remove()
    })
})

describe('EventPicker on touch', () => {
    beforeEach(() => {
        setCoarsePointer(true)
        useAppState.setState({
            files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, undoStack: [], redoStack: [], picker: null,
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
        })
        act(() => s().markEvent(100, { deferred: true }))
    })
    afterEach(() => setCoarsePointer(false))

    it('should close and keep the event with Done', async () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^goal$/i }))
        fireEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(s().picker).toBeNull()
        expect(s().events[0]).toMatchObject({ type: 'goal', matchTimeSec: 100 })
    })

    it('should keep the typed note on Done', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^highlight$/i }))
        fireEvent.click(screen.getByRole('option', { name: /colours/i }))
        fireEvent.click(screen.getByRole('button', { name: /skip/i }))
        fireEvent.change(screen.getByRole('textbox', { name: 'What happened' }), { target: { value: 'late tackle' } })
        fireEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(s().picker).toBeNull()
        expect(s().events[0]).toMatchObject({ type: 'highlight', team: 'Colours', notes: 'late tackle' })
    })

    it('should not autofocus the Highlight text on touch, and offer one Done', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^highlight$/i }))
        fireEvent.click(screen.getByRole('option', { name: /colours/i }))
        fireEvent.click(screen.getByRole('button', { name: /skip/i }))
        expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'What happened' }))
        expect(screen.getAllByRole('button', { name: 'Done' })).toHaveLength(1)
        fireEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(s().picker).toBeNull()
        expect(s().events[0].type).toBe('highlight')
    })

    it('should end a goal after the assist step on touch and offer Add note on the toast, opening the sheet with Note focused', () => {
        act(() => useAppState.setState({ teams: [{ name: 'Whites', color: '#fff', roster: ['Sam'] }, { name: 'Colours', color: '#f00', roster: [] }] }))
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^goal$/i }))
        fireEvent.click(screen.getByRole('option', { name: /whites/i }))
        fireEvent.click(screen.getByRole('option', { name: /sam/i }))
        fireEvent.click(screen.getByRole('button', { name: 'Skip' })) // the assist
        expect(s().picker).toBeNull()
        const t = toastStore.getState().toast
        expect(t?.secondary?.label).toBe('Add note')
        act(() => t?.secondary?.run())
        expect(s().panel).toBe('event')
        expect(s().editingEventId).toBe(s().events[0].id)
        expect(s().editingFocus).toBe('note')
    })

    it('should offer no Add note when the note was typed (desktop)', () => {
        setCoarsePointer(false)
        act(() => useAppState.setState({ picker: null, events: [], teams: [{ name: 'Whites', color: '#fff', roster: ['Sam'] }, { name: 'Colours', color: '#f00', roster: [] }] }))
        act(() => s().markEvent(100))
        render(<EventPicker />)
        press('Enter'); press('w')
        fireEvent.click(screen.getByRole('option', { name: /sam/i }))
        press('Tab')
        fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'top bins' } })
        press('Enter')
        expect(s().picker).toBeNull()
        expect(toastStore.getState().toast?.secondary).toBeUndefined()
    })

    it('should name the dialog Tag event for a fresh tag and Edit event for an existing one', () => {
        render(<EventPicker />)
        expect(screen.getByRole('dialog', { name: 'Tag event' })).toBeInTheDocument()
        cleanup()
        act(() => s().closePicker())
        act(() => s().addEvent({ id: 'old', matchTimeSec: 50, sourceFileIndex: 0, type: 'goal', team: 'Whites' }))
        act(() => s().openPicker('old'))
        render(<EventPicker />)
        expect(screen.getByRole('dialog', { name: 'Edit event' })).toBeInTheDocument()
    })

    it('should offer no Add note for a marker, or when a note exists, and do nothing once the event is gone', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^kick off/i }))
        expect(toastStore.getState().toast?.secondary).toBeUndefined()
        act(() => s().markEvent(200, { deferred: true }))
        cleanup()
        act(() => useAppState.setState({ teams: [{ name: 'Whites', color: '#fff', roster: ['Sam'] }, { name: 'Colours', color: '#f00', roster: [] }] }))
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^goal$/i }))
        fireEvent.click(screen.getByRole('option', { name: /whites/i }))
        fireEvent.click(screen.getByRole('option', { name: /sam/i }))
        fireEvent.click(screen.getByRole('button', { name: 'Skip' })) // the assist
        const t = toastStore.getState().toast
        act(() => s().removeEvent(s().events.find((e) => e.matchTimeSec === 200)!.id))
        act(() => t?.secondary?.run())
        expect(s().panel).not.toBe('event')
    })

    it('should have nothing preselected and create no event until a type is chosen', () => {
        render(<EventPicker />)
        expect(s().events).toEqual([])
        expect(screen.getAllByRole('option').every((o) => o.getAttribute('aria-selected') !== 'true')).toBe(true)
    })

    it('should create nothing when closed with Cancel before choosing a type', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(s().picker).toBeNull()
        expect(s().events).toEqual([])
        expect(s().undoStack).toEqual([])
    })

    it('should create nothing on Escape before choosing a type', () => {
        render(<EventPicker />)
        press('Escape')
        expect(s().picker).toBeNull()
        expect(s().events).toEqual([])
    })

    it('should create the event when a type is tapped, then move to the team step', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^penalty goal/i }))
        expect(s().events).toHaveLength(1)
        expect(s().events[0]).toMatchObject({ type: 'goal', pen: true, matchTimeSec: 100 })
        expect(screen.getByRole('option', { name: /whites/i })).toBeInTheDocument()
    })

    it('should delete the event created from this mark with Cancel after choosing a type', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^goal/i }))
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(s().picker).toBeNull()
        expect(s().events).toEqual([])
    })

    it('should place a Kick off marker straight from the list', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^kick off/i }))
        expect(s().events[0]).toMatchObject({ type: 'kick_off', matchTimeSec: 100 })
        expect(s().picker).toBeNull()
    })

    it('should not preselect the first team either', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^goal$/i }))
        expect(screen.getAllByRole('option').every((o) => o.getAttribute('aria-selected') !== 'true')).toBe(true)
    })

    it('should group the types: Goals, Penalties, Other, Match', () => {
        render(<EventPicker />)
        const groups = screen.getAllByRole('group')
        expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Goals', 'Penalties', 'Other', 'Match'])
        expect(within(groups[0]).getAllByRole('option').map((o) => o.textContent)).toEqual(['Goal', 'Penalty goal', 'Own goal'])
        expect(within(groups[0]).getAllByRole('option').map((o) => o.querySelector('[data-icon]')?.getAttribute('data-icon'))).toEqual(['goal', 'penalty_goal', 'own_goal'])
    })

    it('should hide the keyboard hint', () => {
        render(<EventPicker />)
        expect(screen.queryByText(/esc to finish/i)).not.toBeInTheDocument()
    })
})

describe('EventPicker with a mouse', () => {
    beforeEach(() => {
        setCoarsePointer(false)
        useAppState.setState({ files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, picker: null })
        act(() => s().markEvent(100))
    })

    it('should show the keyboard hint and no Done / Cancel buttons', () => {
        render(<EventPicker />)
        expect(screen.getByText(/esc to finish/i)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
    })
})

describe('EventPicker duplicate-mark guard', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, undoStack: [], redoStack: [], picker: null,
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
        })
    })

    it('should warn when the new mark lands within 3 s of another one', () => {
        act(() => s().addEvent({ id: 'old', matchTimeSec: 99, sourceFileIndex: 0, type: 'goal', team: 'Whites' }))
        act(() => s().markEvent(101))
        render(<EventPicker />)
        expect(screen.getByRole('alert')).toHaveTextContent('Goal already tagged 2 s earlier')
    })

    it('should not warn for a mark on its own', () => {
        act(() => s().addEvent({ id: 'old', matchTimeSec: 90, sourceFileIndex: 0, type: 'goal' }))
        act(() => s().markEvent(101))
        render(<EventPicker />)
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
})

describe('EventPicker optional note', () => {
    beforeEach(() => {
        setCoarsePointer(false)
        useAppState.setState({
            files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, undoStack: [], redoStack: [], picker: null,
            teams: [{ name: 'Whites', color: '#fff', roster: ['Sam Taylor'] }, { name: 'Colours', color: '#f00', roster: ['Jo'] }],
        })
        act(() => s().markEvent(100))
    })

    it('should store a note typed after a save', () => {
        render(<EventPicker />)
        press('s'); press('c')
        fireEvent.click(screen.getByRole('button', { name: /skip/i })) // goalkeeper
        fireEvent.change(screen.getByRole('textbox', { name: /note/i }), { target: { value: 'point blank' } })
        press('Enter')
        expect(s().events[0]).toMatchObject({ type: 'save', team: 'Colours', notes: 'point blank' })
        expect(s().picker).toBeNull()
    })

    it('should store a note typed after a goal', () => {
        render(<EventPicker />)
        press('Enter'); press('w')
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        press('Tab') // no assist
        fireEvent.change(screen.getByRole('textbox', { name: /note/i }), { target: { value: 'top corner' } })
        press('Enter')
        expect(s().events[0]).toMatchObject({ type: 'goal', scorer: 'Sam Taylor', notes: 'top corner' })
    })
})

describe('EventPicker toasts', () => {
    beforeEach(() => {
        dismissToast()
        useAppState.setState({
            files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, undoStack: [], redoStack: [], picker: null,
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
        })
    })
    it('should announce a tag when the picker closes, and Undo removes it', () => {
        act(() => s().markEvent(100))
        render(<EventPicker />)
        press('Enter'); press('w')
        expect(toastStore.getState().toast).toBeNull() // nothing while still choosing
        press('Escape')
        expect(s().picker).toBeNull()
        const toast = toastStore.getState().toast
        expect(toast?.text).toBe('Goal · Whites tagged at 01:40')
        act(() => { toast?.action?.run() })
        expect(s().events).toHaveLength(0)
    })
    it('should say nothing when closing an empty mark or editing an existing event', () => {
        act(() => s().markEvent(100, { deferred: true }))
        render(<EventPicker />)
        press('Escape')
        expect(toastStore.getState().toast).toBeNull()
        const id = 'x1'
        act(() => { useAppState.setState({ events: [{ id, type: 'goal', matchTimeSec: 5, sourceFileIndex: 0 }] }); s().openPicker(id) })
        press('Escape')
        expect(toastStore.getState().toast).toBeNull()
    })
    it('should announce a marker being set', () => {
        act(() => s().setMarkerAt('kick_off', 0, 125))
        expect(toastStore.getState().toast?.text).toBe('Kick off set at 02:05')
    })
    describe('while reviewing', () => {
        const sug = (): void => {
            setReviewWindow({ startAbs: 95, endAbs: 104 })
            useAppState.getState().setSuggestions({ createdAt: 1, source: 'audio', configVersion: 1, analysedSec: 600, total: 1 }, [{ timeSec: 100, score: 5 }])
            useAppState.setState({ panel: 'review', reviewIndex: 0 })
        }
        it('should link a goal tagged inside the loop window to the current suggestion, with the Confirm toast', () => {
            sug()
            act(() => s().markEvent(99))
            render(<EventPicker />)
            press('Enter'); press('w'); press('Escape')
            expect(s().panel).toBe('review')
            expect(s().suggestions[0]).toMatchObject({ status: 'kept', keptAs: 'goal', eventId: s().events[0].id })
            expect(toastStore.getState().toast?.text).toBe('Goal · Whites confirmed at 01:39')
        })
        it('should use the loop window shown, including +2 s extensions', () => {
            sug()
            setReviewWindow({ startAbs: 95, endAbs: 108 }) // the user extended the end twice
            act(() => s().markEvent(107))
            render(<EventPicker />)
            press('Enter'); press('w'); press('Escape')
            expect(s().suggestions[0].status).toBe('kept')
        })
        it('should leave an already kept suggestion alone (no re-link, no duplicate)', () => {
            sug()
            act(() => { s().addEvent({ id: 'old', matchTimeSec: 99, sourceFileIndex: 0, type: 'goal', team: 'Whites' }); s().linkSuggestionEvent(s().suggestions[0].id, 'old') })
            act(() => s().markEvent(100))
            render(<EventPicker />)
            press('Enter'); press('w'); press('Escape')
            expect(s().suggestions[0]).toMatchObject({ status: 'kept', eventId: 'old' })
            expect(toastStore.getState().toast?.text).toMatch(/tagged at/)
        })
        it('should not link a tag outside the window, and still announce it as tagged', () => {
            sug()
            act(() => s().markEvent(300))
            render(<EventPicker />)
            press('Enter'); press('w'); press('Escape')
            expect(s().suggestions[0].status).toBe('pending')
            expect(toastStore.getState().toast?.text).toBe('Goal · Whites tagged at 05:00')
        })
    })
})

describe('EventPicker person lists', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, undoStack: [], redoStack: [], picker: null,
            teams: [{ name: 'Whites', color: '#fff', roster: ['Sandy Wu', 'zoe', 'Sam Taylor', 'Bob'] }, { name: 'Colours', color: '#f00', roster: [] }],
        })
        act(() => s().markEvent(100))
    })
    it('should list names alphabetically, and keep the scorer in the assist list, disabled and in place', () => {
        render(<EventPicker />)
        press('Enter'); press('w')
        expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Bob', 'Sam Taylor', 'Sandy Wu', 'zoe'])
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        const opts = screen.getAllByRole('option')
        expect(opts.map((o) => o.textContent)).toEqual(['Bob', 'Sam Taylor', 'Sandy Wu', 'zoe'])
        const scorer = screen.getByRole('option', { name: /sam taylor/i })
        expect(scorer).toHaveAttribute('aria-disabled', 'true')
        expect(scorer.className).toContain('event-picker__item--disabled')
        fireEvent.click(scorer)
        expect(s().events[0].assist).toBeUndefined() // not selectable
        expect(screen.getByRole('textbox', { name: 'Assist' })).toBeInTheDocument() // still on the assist step
    })
    it('should skip the disabled scorer with the arrow keys', () => {
        render(<EventPicker />)
        press('Enter'); press('w')
        fireEvent.click(screen.getByRole('option', { name: /bob/i })) // scorer: first row
        expect(screen.getByRole('option', { name: /sam taylor/i })).toHaveAttribute('aria-selected', 'true') // Bob is skipped
        press('ArrowDown')
        expect(screen.getByRole('option', { name: /sandy wu/i })).toHaveAttribute('aria-selected', 'true')
        press('ArrowUp'); press('ArrowUp') // back past the disabled Bob, wrapping to the last row
        expect(screen.getByRole('option', { name: /zoe/i })).toHaveAttribute('aria-selected', 'true')
        press('ArrowDown')
        expect(screen.getByRole('option', { name: /sam taylor/i })).toHaveAttribute('aria-selected', 'true')
        press('Enter')
        expect(s().events[0]).toMatchObject({ scorer: 'Bob', assist: 'Sam Taylor' })
    })
})

