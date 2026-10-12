// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useAppState } from '../state'
import { Scorebug } from './Scorebug'
import { TopBar } from './TopBar'

vi.mock('../graphics/assets', () => ({ ensureGraphicsFonts: vi.fn(async () => true), loadLogo: vi.fn(async () => null), loadWordmark: vi.fn(async () => null) }))

const teams = [
    { name: 'Whites', color: '#3a6ea5', roster: [] },
    { name: 'Colours', color: '#c2364a', roster: [] },
]

describe('Scorebug', () => {
    beforeEach(() => {
        useAppState.setState({ teams, events: [], files: [], cumulativeOffsets: [0], currentFileIndex: 0, currentTimeInFileSec: 0 })
    })

    it('should announce the teams and the score at the playhead, updating as it moves', () => {
        useAppState.setState({ events: [{ id: 'g', matchTimeSec: 30, sourceFileIndex: 0, type: 'goal', team: 'Colours' }] })
        render(<Scorebug />)
        const bug = screen.getByRole('status', { name: /Whites 0–0 Colours/ })
        expect(bug.querySelector('canvas')).toBeInTheDocument()
        act(() => useAppState.setState({ currentTimeInFileSec: 60 }))
        expect(screen.getByRole('status')).toHaveAccessibleName('Whites 0–1 Colours')
    })

    it('should be hidden without two teams', () => {
        useAppState.setState({ teams: [] })
        const { container, rerender } = render(<Scorebug />)
        expect(container).toBeEmptyDOMElement()
        act(() => useAppState.setState({ teams }))
        rerender(<Scorebug />)
        expect(container.querySelector('.scorebug-layer')).toBeInTheDocument()
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
