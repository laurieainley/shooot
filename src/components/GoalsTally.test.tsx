// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppState } from '../state'
import { GoalsTally } from './GoalsTally'

const ev = (id: string, type: 'goal' | 'own_goal', team: string, t: number, pen = false) => ({ id, type, team, matchTimeSec: t, sourceFileIndex: 0, ...(pen ? { pen: true } : {}) })
beforeEach(() => {
    useAppState.setState({ cumulativeOffsets: [0], currentTimeInFileSec: 0, events: [], knownFinalScore: null, teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }] })
})

describe('GoalsTally', () => {
    it('should count every goal in the match, not up to the playhead, own goals for the credited team and penalties too', () => {
        useAppState.setState({ events: [ev('a', 'goal', 'Whites', 10), ev('b', 'goal', 'Whites', 500, true), ev('c', 'own_goal', 'Colours', 900), ev('d', 'goal', 'Colours', 950)] as never, currentTimeInFileSec: 5 })
        render(<GoalsTally />)
        expect(screen.getByLabelText('Goals tagged: Whites 2, Colours 2')).toBeTruthy()
        expect(screen.getByText('2 – 2')).toBeTruthy()
    })
    it('should update live and show nothing without two teams', () => {
        render(<GoalsTally />)
        expect(screen.getByText('0 – 0')).toBeTruthy()
        act(() => { useAppState.setState({ events: [ev('a', 'goal', 'Colours', 10)] as never }) })
        expect(screen.getByText('0 – 1')).toBeTruthy()
        act(() => { useAppState.setState({ teams: [] }) })
        expect(screen.queryByText(/Goals tagged/)).toBeNull()
    })

    describe('with a known final score', () => {
        const goals = (n: number, team: string, from = 0) => Array.from({ length: n }, (_, i) => ev(`${team}${from + i}`, 'goal', team, 10 + from + i))
        it('should say how many goals are still to find', () => {
            useAppState.setState({ events: [...goals(11, 'Whites'), ...goals(8, 'Colours')] as never, knownFinalScore: [13, 9] })
            render(<GoalsTally />)
            expect(screen.getByText('11 – 8')).toBeTruthy()
            expect(document.querySelector('.tally__target')?.textContent).toBe('Final 13 – 9 · 3 to find')
            expect(screen.getByLabelText('Goals tagged: Whites 11, Colours 8. Final score Whites 13, Colours 9. 3 to find.')).toBeTruthy()
        })
        it('should show a tick and no final score or gap once everything is tagged', () => {
            useAppState.setState({ events: [...goals(13, 'Whites'), ...goals(9, 'Colours')] as never, knownFinalScore: [13, 9] })
            render(<GoalsTally />)
            expect(screen.getByText('13 – 9')).toBeTruthy()
            expect(screen.getByText('✓ All goals tagged')).toBeTruthy()
            expect(screen.queryByText(/to find/)).toBeNull()
            expect(screen.getByLabelText('Goals tagged: Whites 13, Colours 9. All goals tagged.')).toBeTruthy()
        })
        it('should warn in words when a team has more than the final score', () => {
            useAppState.setState({ events: [...goals(14, 'Whites'), ...goals(9, 'Colours')] as never, knownFinalScore: [13, 9] })
            render(<GoalsTally />)
            expect(document.querySelector('.tally__target')?.textContent).toBe('Final 13 – 9 · 1 more than the final score (Whites) Update to 14–9')
            const warn = screen.getByText('1 more than the final score (Whites)')
            expect(warn.className).toContain('msg-warn')
            expect(screen.queryByText(/to find/)).toBeNull()
            expect(screen.getByLabelText('Goals tagged: Whites 14, Colours 9. Final score Whites 13, Colours 9. 1 more than the final score (Whites).')).toBeTruthy()
        })
        it('should be unchanged without a known score', () => {
            useAppState.setState({ events: goals(2, 'Whites') as never, knownFinalScore: null })
            render(<GoalsTally />)
            expect(screen.queryByText(/final/)).toBeNull()
            expect(screen.getByLabelText('Goals tagged: Whites 2, Colours 0')).toBeTruthy()
        })
    })

    describe('header form', () => {
        it('should be a short score with the final score, labelled in full', () => {
            useAppState.setState({ events: [ev('a', 'goal', 'Whites', 10)] as never, knownFinalScore: [3, 2] })
            render(<GoalsTally head />)
            expect(screen.getByText('1 – 0 · final 3 – 2')).toBeTruthy()
            expect(screen.getByRole('group').getAttribute('aria-label')).toMatch(/^Goals tagged: Whites 1, Colours 0\. Final score Whites 3, Colours 2/)
        })
        it('should be just the score without a known final', () => {
            render(<GoalsTally head />)
            expect(screen.getByText('0 – 0')).toBeTruthy()
        })
    })
})

describe('GoalsTally update link', () => {
    const mk = (n: number, team: string) => Array.from({ length: n }, (_, i) => ev(`${team}${i}`, 'goal', team, 10 + i))
    it('should offer Update to the raised score only when over, and apply it', () => {
        useAppState.setState({ events: [...mk(3, 'Whites'), ...mk(1, 'Colours')] as never, knownFinalScore: [3, 2] })
        render(<GoalsTally />)
        expect(screen.queryByRole('button', { name: /Update to/ })).toBeNull()
        act(() => { useAppState.setState({ events: [...mk(4, 'Whites'), ...mk(1, 'Colours')] as never }) })
        screen.getByRole('button', { name: 'Update to 4–2' }).click()
        expect(useAppState.getState().knownFinalScore).toEqual([4, 2])
    })
})
