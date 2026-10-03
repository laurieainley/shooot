// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAppState } from '../state'
import { ScoreBadge } from './ScoreBadge'

const teams = [
    { name: 'Whites', color: '#3a6ea5', roster: [] },
    { name: 'Colours', color: '#c2364a', roster: [] },
]

describe('ScoreBadge', () => {
    beforeEach(() => {
        useAppState.setState({ teams, events: [] })
    })

    it('should count goals per team in Match-setup order, crediting own goals to the team field', () => {
        useAppState.setState({
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

    it('should be hidden when no team has a name', () => {
        useAppState.setState({ teams: teams.map((t) => ({ ...t, name: '' })) })
        render(<ScoreBadge />)
        expect(screen.queryByRole('status', { name: 'Score' })).not.toBeInTheDocument()
    })
})
