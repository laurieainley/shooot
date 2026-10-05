// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { MatchSetup } from './MatchSetup'

const s = () => useAppState.getState()

describe('MatchSetup', () => {
    beforeEach(() => {
        useAppState.setState({
            teams: [{ name: 'Whites', color: '#f5f5f5', roster: [] }, { name: 'Colours', color: '#f72585', roster: [] }],
            events: [{ id: 'e', matchTimeSec: 1, sourceFileIndex: 0, type: 'goal', team: 'Whites' }],
            files: [], cumulativeOffsets: [], currentFileIndex: 0, currentTimeInFileSec: 75, matchStartTimeSec: 0,
        })
    })

    it('should rename a team and update its events', async () => {
        render(<MatchSetup onClose={() => {}} />)
        const name = screen.getByLabelText('Team 1 name')
        await userEvent.clear(name)
        await userEvent.type(name, 'Lights')
        fireEvent.blur(name)
        expect(s().teams[0].name).toBe('Lights')
        expect(s().events[0].team).toBe('Lights')
    })

    it('should parse a pasted roster on blur', () => {
        render(<MatchSetup onClose={() => {}} />)
        const roster = screen.getByLabelText('Team 2 roster')
        fireEvent.change(roster, { target: { value: '1. Jo\n2. Alex, Jo' } })
        fireEvent.blur(roster)
        expect(s().teams[1].roster).toEqual(['Jo', 'Alex'])
    })

    it('should set the match start from the current time', async () => {
        render(<MatchSetup onClose={() => {}} />)
        await userEvent.click(screen.getByRole('button', { name: /use current time/i }))
        expect(s().matchStartTimeSec).toBe(75)
    })

    it('should say that teams and rosters are remembered', () => {
        render(<MatchSetup onClose={() => {}} />)
        expect(screen.getByText('Teams and rosters are remembered for next time.')).toBeInTheDocument()
    })
})
