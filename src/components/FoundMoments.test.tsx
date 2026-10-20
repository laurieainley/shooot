// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppState } from '../state'
import { toastStore } from '../toasts'
import { setMedia } from '../test/pointer'
import { setPlayerPaused, registerPlayerToggle } from './playerControl'
import { TagControls } from './TagControls'
import { Panels } from './Panels'
import { FindGoalsChip } from './FindGoalsChip'
import type { VideoSourceFile } from '../types'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 600, kind: 'full' })
const s = () => useAppState.getState()
const RUN = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 3 }

function seed(nowSec: number): void {
    useAppState.setState({
        files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, currentTimeInFileSec: nowSec, undoStack: [], redoStack: [],
        picker: null, panel: null, suggestions: [], suggestionRun: null, discardStack: [],
    })
    s().setSuggestions(RUN, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
}

const seeks: { fileIndex: number; timeSec: number }[] = []
const onSeek = (e: Event): void => { seeks.push((e as CustomEvent).detail) }

beforeEach(() => {
    setMedia({ coarse: true, landscape: true })
    seeks.length = 0
    window.addEventListener('seekToGoal', onSeek)
})
afterEach(() => { window.removeEventListener('seekToGoal', onSeek); cleanup(); setMedia({}) })

describe('Not a goal (touch view)', () => {
    it('should show the found-moment chip and Not a goal only while on a pending moment', () => {
        seed(95)
        const { rerender } = render(<TagControls variant="overlay" />)
        expect(screen.getByRole('status', { name: /Found moment · 1 of 2 · 01:40/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Not a goal/ })).toBeTruthy()
        act(() => useAppState.setState({ currentTimeInFileSec: 200 }))
        rerender(<TagControls variant="overlay" />)
        expect(screen.queryByRole('button', { name: /Not a goal/ })).toBeNull()
        expect(screen.queryByRole('status', { name: /Found moment/ })).toBeNull()
    })

    it('should keep the Not a goal slot when off a moment so Tag never moves', () => {
        seed(200)
        const { container } = render(<TagControls variant="overlay" />)
        expect(screen.queryByRole('button', { name: /Not a goal/ })).toBeNull()
        expect(container.querySelector('.tv-right .tv-notgoal--slot')).not.toBeNull()
    })

    it('should reject the moment, offer Undo, and jump 6 s before the next pending one', () => {
        seed(100)
        render(<TagControls variant="overlay" />)
        fireEvent.click(screen.getByRole('button', { name: /Not a goal/ }))
        expect(s().suggestions[0].status).toBe('rejected')
        expect(toastStore.getState().toast?.text).toMatch(/^Discarded/)
        expect(toastStore.getState().toast?.action?.label).toBe('Undo')
        expect(seeks).toEqual([{ fileIndex: 0, timeSec: 294 }])
        act(() => toastStore.getState().toast?.action?.run())
        expect(s().suggestions[0].status).toBe('pending')
    })

    it('should pause when no moment is left', () => {
        seed(300)
        const toggle = vi.fn()
        const off = registerPlayerToggle(toggle)
        act(() => { setPlayerPaused(false) })
        act(() => s().decideSuggestion(s().suggestions[0].id, { kind: 'reject' }))
        render(<TagControls variant="overlay" />)
        fireEvent.click(screen.getByRole('button', { name: /Not a goal/ }))
        expect(s().suggestions.every((x) => x.status === 'rejected')).toBe(true)
        expect(seeks).toEqual([])
        expect(toggle).toHaveBeenCalled()
        act(() => { setPlayerPaused(true) })
        off()
    })

    it('should not show a top pick as a plain moment', () => {
        seed(100)
        act(() => s().setSuggestionBall(s().suggestions[0].id, { x: 0, y: 0 } as never))
        render(<TagControls variant="overlay" />)
        expect(screen.getByRole('status', { name: /★ Top pick · 1 of 2/ })).toBeTruthy()
    })
})

describe('Find goals chip and sheet (touch view)', () => {
    it('should say what is left to check and open the Find goals sheet, not the review card', () => {
        seed(0)
        render(<><FindGoalsChip /><Panels /></>)
        const chip = screen.getByRole('button', { name: 'Find goals: 2 found' })
        fireEvent.click(chip)
        expect(s().panel).toBe('review')
        expect(screen.getByRole('dialog', { name: 'Find goals' })).toBeTruthy()
        expect(document.querySelector('.review')).toBeNull() // no review card
        expect(document.querySelector('.find-sheet')).not.toBeNull()
        expect(screen.getByText(/2 to check/)).toBeTruthy()
    })

    it('should offer the start form from a chip that has not run', () => {
        useAppState.setState({ files: [vf('a.mp4')], events: [], suggestions: [], suggestionRun: null, panel: null })
        render(<><FindGoalsChip /><Panels /></>)
        fireEvent.click(screen.getByRole('button', { name: 'Find goals' }))
        expect(screen.getByRole('dialog', { name: 'Find goals' })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Find goals$/ })).toBeTruthy()
    })

    it('should say all found moments are checked, with the summary line', () => {
        seed(0)
        for (const x of s().suggestions) act(() => s().decideSuggestion(x.id, { kind: 'reject' }))
        render(<><FindGoalsChip /><Panels /></>)
        fireEvent.click(screen.getByRole('button', { name: 'Find goals: All found moments checked' }))
        expect(screen.getByText('You kept 0 of 2.')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Find goals again' })).toBeTruthy()
    })

    it('should still open the review card on desktop (mouse)', () => {
        setMedia({ desktop: true })
        seed(0)
        act(() => s().openPanel('review'))
        render(<Panels />)
        expect(document.querySelector('.find-sheet')).toBeNull()
        expect(document.querySelector('.review')).not.toBeNull() // the review card
    })
})
