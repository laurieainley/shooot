// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
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
        expect(s().picker).toBeNull()
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
        act(() => s().markEvent(100))
    })
    afterEach(() => setCoarsePointer(false))

    it('should close and keep the event with Done', async () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^goal ⏎/i }))
        fireEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(s().picker).toBeNull()
        expect(s().events[0]).toMatchObject({ type: 'goal', matchTimeSec: 100 })
    })

    it('should keep the typed note on Done', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('option', { name: /^foul/i }))
        fireEvent.click(screen.getByRole('option', { name: /colours/i }))
        fireEvent.click(screen.getByRole('button', { name: /skip/i }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'late tackle' } })
        fireEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(s().picker).toBeNull()
        expect(s().events[0]).toMatchObject({ type: 'foul', team: 'Colours', notes: 'late tackle' })
    })

    it('should delete the just-created event with Cancel', () => {
        render(<EventPicker />)
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(s().picker).toBeNull()
        expect(s().events).toEqual([])
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
