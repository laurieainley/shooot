// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { useAppState } from '../state'
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

 it('should ask for an optional assist after the scorer, listing the team without the scorer', () => {
        render(<EventPicker />)
        press('Enter')
        press('w')
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        expect(s().picker).not.toBeNull()
        expect(screen.getByRole('textbox', { name: 'Assist' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: /sandy wu/i })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: /sam taylor/i })).not.toBeInTheDocument()
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

    it('should offer the assist step on touch too', () => {
        setCoarsePointer(true)
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^goal/i }))
        fireEvent.click(screen.getByRole('option', { name: /whites/i }))
        fireEvent.click(screen.getByRole('option', { name: /sam taylor/i }))
        expect(screen.getByRole('textbox', { name: 'Assist' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('option', { name: /sandy wu/i }))
        expect(s().events[0].assist).toBe('Sandy Wu')
        expect(s().picker).not.toBeNull() // the optional note
        press('Enter')
        expect(s().picker).toBeNull()
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
        fireEvent.click(screen.getByRole('option', { name: /^foul$/i }))
        fireEvent.click(screen.getByRole('option', { name: /colours/i }))
        fireEvent.click(screen.getByRole('button', { name: /skip/i }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'late tackle' } })
        fireEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(s().picker).toBeNull()
        expect(s().events[0]).toMatchObject({ type: 'foul', team: 'Colours', notes: 'late tackle' })
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
        expect(within(groups[0]).getAllByRole('option').map((o) => o.querySelector('.ev-tag')?.className.split(' ').pop())).toEqual(['ev-tag--goal', 'ev-tag--pen-goal', 'ev-tag--own-goal'])
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
