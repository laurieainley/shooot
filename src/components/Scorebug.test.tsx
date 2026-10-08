// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useAppState } from '../state'
import { Scorebug } from './Scorebug'
import { TopBar } from './TopBar'

const teams = [
    { name: 'Whites', color: '#3a6ea5', roster: [] },
    { name: 'Colours', color: '#c2364a', roster: [] },
]

describe('Scorebug', () => {
    beforeEach(() => {
        useAppState.setState({ teams, events: [], files: [], cumulativeOffsets: [0], currentFileIndex: 0, currentTimeInFileSec: 0 })
    })

    it('should show initials and the score at the playhead, updating as it moves', () => {
        useAppState.setState({ events: [{ id: 'g', matchTimeSec: 30, sourceFileIndex: 0, type: 'goal', team: 'Colours' }] })
        render(<Scorebug />)
        const bug = screen.getByRole('status', { name: /Whites 0–0 Colours/ })
        expect(bug).toHaveTextContent('WH')
        expect(bug).toHaveTextContent('CO')
        expect(bug).toHaveTextContent('0–0')
        act(() => useAppState.setState({ currentTimeInFileSec: 60 }))
        expect(screen.getByRole('status')).toHaveTextContent('0–1')
        expect(screen.getByRole('status')).toHaveAccessibleName('Whites 0–1 Colours')
    })

    it('should show the match clock after kick-off only', () => {
        useAppState.setState({ events: [{ id: 'ko', matchTimeSec: 10, sourceFileIndex: 0, type: 'kick_off' }], currentTimeInFileSec: 75 })
        const { container } = render(<Scorebug />)
        expect(container.querySelector('.scorebug__clock')).toHaveTextContent('01:05')
        act(() => useAppState.setState({ currentTimeInFileSec: 5 }))
        expect(container.querySelector('.scorebug__clock')).toBeNull()
    })

    it('should be hidden without two teams, and never take pointer events', () => {
        useAppState.setState({ teams: [] })
        const { container, rerender } = render(<Scorebug />)
        expect(container).toBeEmptyDOMElement()
        act(() => useAppState.setState({ teams }))
        rerender(<Scorebug />)
        expect(container.querySelector('.scorebug-layer')).toBeInTheDocument()
    })

    it('should stripe a multicolour kit bar', () => {
        useAppState.setState({ teams: [{ name: 'Rainbow', color: 'multi', roster: [] }, teams[1]] })
        const { container } = render(<Scorebug />)
        expect((container.querySelector('.scorebug__bar') as HTMLElement).style.background).toContain('linear-gradient')
    })
})

describe('TopBar', () => {
    it('should no longer render the score', () => {
        useAppState.setState({ teams })
        render(<TopBar layout="desktop" />)
        expect(screen.queryByRole('status', { name: /Whites/ })).toBeNull()
        expect(screen.queryByText('WH')).toBeNull()
    })
})
