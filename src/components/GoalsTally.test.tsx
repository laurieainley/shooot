// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppState } from '../state'
import { GoalsTally } from './GoalsTally'

const ev = (id: string, type: 'goal' | 'own_goal', team: string, t: number, pen = false) => ({ id, type, team, matchTimeSec: t, sourceFileIndex: 0, ...(pen ? { pen: true } : {}) })
beforeEach(() => {
    useAppState.setState({ cumulativeOffsets: [0], currentTimeInFileSec: 0, events: [], teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }] })
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
})
