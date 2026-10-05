// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useAppState } from '../state'
import { ScoreBadge } from './ScoreBadge'

const teams = [
    { name: 'Whites', color: '#3a6ea5', roster: [] },
    { name: 'Colours', color: '#c2364a', roster: [] },
]

describe('ScoreBadge', () => {
    beforeEach(() => {
        useAppState.setState({ teams, events: [], cumulativeOffsets: [0], currentFileIndex: 0, currentTimeInFileSec: 0 })
    })

    it('should count goals per team in Match-setup order, crediting own goals to the team field', () => {
        useAppState.setState({
            currentTimeInFileSec: 999,
            events: [
                { id: '1', matchTimeSec: 10, type: 'goal', team: 'Whites' },
                { id: '2', matchTimeSec: 20, type: 'goal', pen: true, team: 'Whites' },
                { id: '3', matchTimeSec: 30, type: 'own_goal', team: 'Colours', scorer: 'Sam' },
                { id: '4', matchTimeSec: 40, type: 'highlight', team: 'Colours' },
                { id: '5', matchTimeSec: 50, type: 'goal', team: 'Colours', unlinked: true },
            ],
        })
        render(<ScoreBadge />)
        const badge = screen.getByRole('status', { name: 'Score' })
        expect(badge).toHaveTextContent('Whites2–1Colours')
        expect(badge).toHaveAccessibleName('Score')
        expect(screen.getByTitle('Whites 2–1 Colours')).toBeInTheDocument()
    })

    it('should show 0–0 before any goal', () => {
        render(<ScoreBadge />)
        expect(screen.getByRole('status', { name: 'Score' })).toHaveTextContent('0–0')
    })

    it('should show the score at the playhead with the final in brackets when different', () => {
        useAppState.setState({
            events: [
                { id: '1', matchTimeSec: 10, type: 'goal', team: 'Whites' },
                { id: '2', matchTimeSec: 20, type: 'goal', team: 'Colours' },
                { id: '3', matchTimeSec: 30, type: 'goal', team: 'Colours', sourceFileIndex: 1 },
            ],
            cumulativeOffsets: [0, 100],
            currentTimeInFileSec: 15,
        })
        render(<ScoreBadge />)
        const badge = screen.getByRole('status', { name: 'Score' })
        expect(badge).toHaveTextContent('Whites1–0Colours(1–2)')
        expect(badge).toHaveAttribute('title', 'Whites 1–0 Colours (final 1–2)')
        act(() => useAppState.setState({ currentFileIndex: 1, currentTimeInFileSec: 30 }))
        expect(badge).toHaveTextContent('Whites1–2Colours')
        expect(badge).not.toHaveTextContent('(')
    })

    it('should show the final in brackets in the compact badge too', () => {
        useAppState.setState({ events: [{ id: '1', matchTimeSec: 10, type: 'goal', team: 'Whites' }] })
        render(<ScoreBadge compact />)
        expect(screen.getByRole('status', { name: 'Score' })).toHaveTextContent('0–0(1–0)')
    })

    it('should be hidden when no team has a name', () => {
        useAppState.setState({ teams: teams.map((t) => ({ ...t, name: '' })) })
        render(<ScoreBadge />)
        expect(screen.queryByRole('status', { name: 'Score' })).not.toBeInTheDocument()
    })
})
