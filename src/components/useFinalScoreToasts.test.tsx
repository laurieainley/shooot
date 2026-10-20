// @vitest-environment happy-dom
import { act, render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppState } from '../state'
import { dismissToast, showToast, toastStore } from '../toasts'
import { UpdateScoreLink } from './UpdateScoreLink'
import { useFinalScoreToasts } from './useFinalScoreToasts'

const goal = (id: string, team: string, t: number) => ({ id, type: 'goal', team, matchTimeSec: t, sourceFileIndex: 0 })
const goals = (n: number, team: string, from = 0) => Array.from({ length: n }, (_, i) => goal(`${team}${from + i}`, team, 10 + from + i))
const teams = [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }]
const setEvents = (e: unknown[]) => act(() => { useAppState.setState({ events: e as never }) })
function Host() { useFinalScoreToasts(); return <UpdateScoreLink /> }

beforeEach(() => {
    dismissToast()
    useAppState.setState({ cumulativeOffsets: [0], events: [...goals(2, 'Whites'), ...goals(1, 'Colours')] as never, teams, knownFinalScore: [2, 1] })
})

describe('useFinalScoreToasts over the final score', () => {
    it('should stay quiet on mount even when already over', () => {
        useAppState.setState({ events: goals(3, 'Whites') as never })
        render(<Host />)
        expect(toastStore.getState().toast).toBeNull()
    })
    it('should fire once going over, with an Update action that raises the score', () => {
        render(<Host />)
        setEvents([...goals(3, 'Whites'), ...goals(1, 'Colours')])
        const t = toastStore.getState().toast
        expect(t?.text).toBe('That’s more than the final score (2–1) — it may need updating.')
        expect(t?.action?.label).toBe('Update to 3–1')
        const id = t?.id
        setEvents([...goals(4, 'Whites'), ...goals(1, 'Colours')]) // still over: no new toast
        expect(toastStore.getState().toast?.id).toBe(id)
        act(() => t?.action?.run())
        expect(useAppState.getState().knownFinalScore).toEqual([4, 1])
    })
    it('should fire again after going back under and over', () => {
        render(<Host />)
        setEvents([...goals(3, 'Whites'), ...goals(1, 'Colours')])
        const id = toastStore.getState().toast?.id
        setEvents([...goals(2, 'Whites'), ...goals(1, 'Colours')])
        act(() => dismissToast())
        setEvents([...goals(3, 'Whites'), ...goals(1, 'Colours')])
        expect(toastStore.getState().toast?.id).not.toBe(id)
        expect(toastStore.getState().toast?.text).toMatch(/more than the final score/)
    })
    it('should join a fresh tag toast: keeps its Undo, Update takes the secondary slot', () => {
        render(<Host />)
        act(() => {
            showToast('Goal tagged', { label: 'Undo', run: () => {} }, { label: 'Add note', run: () => {} })
            useAppState.setState({ events: [...goals(3, 'Whites'), ...goals(1, 'Colours')] as never })
        })
        const t = toastStore.getState().toast
        expect(t?.text).toBe('Goal tagged · more than the final score (2–1)')
        expect(t?.action?.label).toBe('Undo')
        expect(t?.secondary?.label).toBe('Update to 3–1')
    })
    it('should still say all goals tagged on reaching the score, once', () => {
        useAppState.setState({ events: goals(1, 'Whites') as never })
        render(<Host />)
        setEvents([...goals(2, 'Whites'), ...goals(1, 'Colours')])
        expect(toastStore.getState().toast?.text).toMatch(/All 3 goals tagged/)
    })
    it('should do nothing without a known score', () => {
        useAppState.setState({ knownFinalScore: null })
        render(<Host />)
        setEvents(goals(5, 'Whites'))
        expect(toastStore.getState().toast).toBeNull()
    })
})

describe('UpdateScoreLink', () => {
    it('should render only when over, and set the raised score', () => {
        render(<UpdateScoreLink />)
        expect(screen.queryByRole('button')).toBeNull()
        setEvents([...goals(3, 'Whites'), ...goals(1, 'Colours')])
        fireEvent.click(screen.getByRole('button', { name: 'Update to 3–1' }))
        expect(useAppState.getState().knownFinalScore).toEqual([3, 1])
        expect(screen.queryByRole('button', { name: /Update to/ })).toBeNull()
    })
})
