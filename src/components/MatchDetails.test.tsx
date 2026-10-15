// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'

const saved: { blob: Blob | 'none' | null } = { blob: null }
vi.mock('../graphics/logoStore', () => ({
    loadCustomLogo: vi.fn(async () => saved.blob),
    saveCustomLogo: vi.fn(async (b: Blob) => { if (!b.type.startsWith('image/')) throw new Error('Pick an image file for the logo'); saved.blob = b }),
    clearCustomLogo: vi.fn(async () => { saved.blob = null }),
    hideLogo: vi.fn(async () => { saved.blob = 'none' }),
}))

import { MatchDetails } from './MatchDetails'

const s = () => useAppState.getState()

describe('MatchDetails', () => {
    beforeEach(() => {
        saved.blob = null
        URL.createObjectURL = vi.fn(() => 'blob:logo')
        URL.revokeObjectURL = vi.fn()
        useAppState.setState({
            teams: [{ name: "Ryan's Rovers", color: '#f0f0f0', roster: [] }, { name: 'Walford Town', color: '#ec5fa4', roster: [] }],
            matchdayLabel: null,
        })
    })

    it('should call the heading Title, show an example as a placeholder only and keep an edited one', () => {
        render(<MatchDetails />)
        const field = screen.getByLabelText('Title')
        expect(field).toHaveAttribute('placeholder', 'Matchday 3')
        expect(field).toHaveValue('')
        fireEvent.change(field, { target: { value: 'Cup final' } })
        fireEvent.blur(field)
        expect(s().matchdayLabel).toBe('Cup final')
    })

    it('should show team names in normal case, not the uppercase scoreboard voice', () => {
        render(<MatchDetails />)
        expect(screen.getByLabelText('Team 1 name')).not.toHaveClass('voice-scoreboard')
    })

    it('should place an aside (the goal areas) in the side column after the logo and style, leaving the main column to the teams', () => {
        render(<MatchDetails aside={<section aria-label="Aside" />} />)
        const side = screen.getByRole('region', { name: 'Aside' }).closest('.match-details__side')
        expect(side).not.toBeNull()
        expect(side?.contains(screen.getByAltText('League logo'))).toBe(true)
        expect(side?.contains(screen.getByLabelText('Team 1 name'))).toBe(false)
        expect(document.querySelector('.match-details__main')?.contains(screen.getByLabelText('Team 1 name'))).toBe(true)
    })

    it('should have no side column when compact', () => {
        render(<MatchDetails compact />)
        expect(document.querySelector('.match-details__side')).toBeNull()
    })

    it('should put the full name first with its initials beside it, derived from the name', () => {
        render(<MatchDetails />)
        const name = screen.getByLabelText('Team 1 name')
        const initials = screen.getByLabelText('Team 1 initials')
        expect(initials).toHaveValue('RR')
        expect(name.compareDocumentPosition(initials) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        fireEvent.change(name, { target: { value: 'Real Madrid CF' } })
        expect(initials).toHaveValue('RMC')
        expect(s().teams[0].initials).toBeUndefined() // derived, not stored
    })

    it('should keep initials the user typed, and return to derived when cleared', async () => {
        render(<MatchDetails />)
        const initials = screen.getByLabelText('Team 2 initials')
        await userEvent.clear(initials)
        await userEvent.type(initials, 'wft')
        expect(s().teams[1].initials).toBe('WFT')
        fireEvent.change(screen.getByLabelText('Team 2 name'), { target: { value: 'Other Name' } })
        expect(initials).toHaveValue('WFT')
        await userEvent.clear(initials)
        expect(s().teams[1].initials).toBeUndefined()
        await userEvent.tab()
        expect(initials).toHaveValue('ON')
    })

    it('should show the roster as tags that save straight to the team', async () => {
        render(<MatchDetails />)
        await userEvent.type(screen.getByLabelText('Team 2 roster'), 'Jo{Enter}Alex{Enter}')
        expect(s().teams[1].roster).toEqual(['Alex', 'Jo'])
        await userEvent.click(screen.getByRole('button', { name: 'Remove Jo' }))
        expect(s().teams[1].roster).toEqual(['Alex'])
    })

    it('should let the league logo be removed, show No logo, and come back with Use default logo or Replace logo', async () => {
        render(<MatchDetails />)
        await userEvent.click(screen.getByRole('button', { name: /remove logo/i }))
        await waitFor(() => expect(screen.getByRole('img', { name: /no league logo/i })).toBeInTheDocument())
        expect(saved.blob).toBe('none')
        expect(screen.queryByRole('button', { name: /remove logo/i })).toBeNull()
        expect(screen.getByRole('button', { name: /replace logo/i })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: /use default logo/i }))
        await waitFor(() => expect(screen.getByRole('img', { name: /^league logo$/i })).toHaveAttribute('src', '/brand/tnf-logo.webp'))
        expect(saved.blob).toBeNull()
    })

    it('should open in the No logo state when the logo was removed earlier', async () => {
        saved.blob = 'none'
        render(<MatchDetails />)
        await waitFor(() => expect(screen.getByRole('img', { name: /no league logo/i })).toBeInTheDocument())
    })

    it('should show the default logo and let a picked image replace it', async () => {
        render(<MatchDetails />)
        expect(screen.getByRole('img', { name: /league logo/i })).toHaveAttribute('src', '/brand/tnf-logo.webp')
        const input = screen.getByLabelText('Logo file')
        await userEvent.upload(input, new File(['png'], 'badge.png', { type: 'image/png' }))
        await waitFor(() => expect(screen.getByRole('img', { name: /league logo/i })).toHaveAttribute('src', 'blob:logo'))
        expect(saved.blob).not.toBeNull()
        await userEvent.click(screen.getByRole('button', { name: /use default logo/i }))
        await waitFor(() => expect(screen.getByRole('img', { name: /league logo/i })).toHaveAttribute('src', '/brand/tnf-logo.webp'))
        expect(saved.blob).toBeNull()
    })
})

describe('MatchDetails graphics style', () => {
    beforeEach(() => {
        useAppState.setState({
            teams: [{ name: 'Whites', color: '#f0f0f0', roster: [] }, { name: 'Colours', color: '#ec5fa4', roster: [] }],
            graphics: { cards: true, lowerThirds: true, replayTag: true, theme: 'shooot' },
        })
    })

    it('should offer the three styles with the current one selected and switch the style in the store', async () => {
        render(<MatchDetails />)
        const group = screen.getByRole('radiogroup', { name: 'Graphics style' })
        expect(group).toBeInTheDocument()
        expect(screen.getAllByRole('radio')).toHaveLength(3)
        expect(screen.getByRole('radio', { name: /shooot/i })).toBeChecked()
        await userEvent.click(screen.getByRole('radio', { name: /tnf/i }))
        expect(s().graphics.theme).toBe('tnf')
        expect(s().graphics.cards).toBe(true)
        expect(screen.getByRole('radio', { name: /tnf/i })).toBeChecked()
    })

    it('should show Shooot for an unknown saved style', () => {
        useAppState.setState({ graphics: { cards: true, lowerThirds: true, replayTag: true, theme: 'neon' as never } })
        render(<MatchDetails />)
        expect(screen.getByRole('radio', { name: /shooot/i })).toBeChecked()
    })
})

describe('MatchDetails final score (if you know it)', () => {
    beforeEach(() => {
        saved.blob = null
        URL.createObjectURL = vi.fn(() => 'blob:logo')
        URL.revokeObjectURL = vi.fn()
        useAppState.setState({
            teams: [{ name: "Ryan's Rovers", color: '#f0f0f0', roster: [] }, { name: 'Walford Town', color: '#ec5fa4', roster: [] }],
            knownFinalScore: null,
        })
    })
    const first = () => screen.getByLabelText("Ryan's Rovers final score")
    const second = () => screen.getByLabelText('Walford Town final score')

    it('should show a labelled row with a numeric box per team', () => {
        render(<MatchDetails />)
        expect(screen.getByText('Final score (if you know it)')).toBeInTheDocument()
        expect(first()).toHaveAttribute('inputmode', 'numeric')
        expect(second()).toHaveAttribute('inputmode', 'numeric')
        expect(first()).toHaveValue('')
    })
    it('should save when both boxes hold whole numbers, on blur', async () => {
        render(<MatchDetails />)
        await userEvent.type(first(), '13')
        await userEvent.type(second(), '9')
        fireEvent.blur(second())
        expect(s().knownFinalScore).toEqual([13, 9])
        expect(screen.queryByText('Enter both scores, or leave both empty.')).toBeNull()
    })
    it('should save on Enter', async () => {
        render(<MatchDetails />)
        await userEvent.type(first(), '2')
        await userEvent.type(second(), '0{Enter}')
        expect(s().knownFinalScore).toEqual([2, 0])
    })
    it('should accept 0-0 and ignore anything that is not a digit', async () => {
        render(<MatchDetails />)
        await userEvent.type(first(), '0')
        await userEvent.type(second(), 'x0')
        fireEvent.blur(second())
        expect(second()).toHaveValue('0')
        expect(s().knownFinalScore).toEqual([0, 0])
    })
    it('should show a plain hint and save nothing when only one box is filled', async () => {
        render(<MatchDetails />)
        await userEvent.type(first(), '13')
        fireEvent.blur(first())
        expect(screen.getByText('Enter both scores, or leave both empty.')).toBeInTheDocument()
        expect(s().knownFinalScore).toBeNull()
        expect(first()).toHaveValue('13')
    })
    it('should save null when both boxes are emptied', async () => {
        useAppState.setState({ knownFinalScore: [3, 1] })
        render(<MatchDetails />)
        expect(first()).toHaveValue('3')
        await userEvent.clear(first())
        await userEvent.clear(second())
        fireEvent.blur(second())
        expect(s().knownFinalScore).toBeNull()
    })
    it('should offer Clear only when a score is set', async () => {
        render(<MatchDetails />)
        expect(screen.queryByRole('button', { name: 'Clear final score' })).toBeNull()
        useAppState.setState({ knownFinalScore: [3, 1] })
        await userEvent.click(await screen.findByRole('button', { name: 'Clear final score' }))
        expect(s().knownFinalScore).toBeNull()
        expect(first()).toHaveValue('')
    })
    it('should show a dash in empty boxes and step from empty to 1-0 with +', async () => {
        render(<MatchDetails />)
        expect(first()).toHaveAttribute('placeholder', '–')
        await userEvent.click(screen.getByRole('button', { name: "One more for Ryan's Rovers" }))
        expect(s().knownFinalScore).toEqual([1, 0])
        expect(first()).toHaveValue('1')
        expect(second()).toHaveValue('0')
        await userEvent.click(screen.getByRole('button', { name: 'One more for Walford Town' }))
        expect(s().knownFinalScore).toEqual([1, 1])
    })
    it('should step the other side from empty too, and never go below 0', async () => {
        render(<MatchDetails />)
        await userEvent.click(screen.getByRole('button', { name: 'One more for Walford Town' }))
        expect(s().knownFinalScore).toEqual([0, 1])
        await userEvent.click(screen.getByRole('button', { name: "One fewer for Ryan's Rovers" }))
        expect(s().knownFinalScore).toEqual([0, 1])
        await userEvent.click(screen.getByRole('button', { name: 'One fewer for Walford Town' }))
        await userEvent.click(screen.getByRole('button', { name: 'One fewer for Walford Town' }))
        expect(s().knownFinalScore).toEqual([0, 0])
    })
    it('should not set a score when - is pressed on an empty score', async () => {
        render(<MatchDetails />)
        await userEvent.click(screen.getByRole('button', { name: 'One fewer for Walford Town' }))
        expect(s().knownFinalScore).toBeNull()
    })
    it('should still allow typing after stepping', async () => {
        render(<MatchDetails />)
        await userEvent.click(screen.getByRole('button', { name: "One more for Ryan's Rovers" }))
        await userEvent.clear(first())
        await userEvent.type(first(), '7')
        fireEvent.blur(second())
        expect(s().knownFinalScore).toEqual([7, 0])
    })
    it('should use Team 1 / Team 2 when a name is empty', () => {
        useAppState.setState({ teams: [{ name: '', color: '#fff', roster: [] }, { name: '', color: '#000', roster: [] }] })
        render(<MatchDetails />)
        expect(screen.getByLabelText('Team 1 final score')).toBeInTheDocument()
        expect(screen.getByLabelText('Team 2 final score')).toBeInTheDocument()
    })
})

describe('MatchDetails team sheet', () => {
    beforeEach(() => {
        useAppState.setState({
            teams: [{ name: 'Whites', color: '#f5f5f5', roster: [] }, { name: 'Colours', color: '#3a6ea5', roster: [] }],
            matchdayLabel: null,
        })
    })
    it('should show the fixture line from the live team names', () => {
        render(<MatchDetails compact />)
        expect(screen.getByTestId('fixture')).toHaveTextContent('Whites v Colours')
        expect(screen.getByTestId('fixture')).toHaveAttribute('aria-hidden', 'true')
    })
    it('should print the initials on the team shirt', () => {
        render(<MatchDetails compact />)
        expect(screen.getAllByTestId('team-shirt')[0]).toHaveTextContent('WH')
    })
})

it('should leave out the logo and graphics style when compact', () => {
    render(<MatchDetails compact />)
    expect(screen.queryByRole('img', { name: /league logo/i })).toBeNull()
    expect(screen.queryByText(/graphics style/i)).toBeNull()
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/final score/)).toHaveLength(2)
})

describe('MatchDetails remembered players', () => {
    beforeEach(() => {
        useAppState.setState({
            teams: [{ name: 'A', color: '#f0f0f0', roster: ['Sam'] }, { name: 'B', color: '#ec5fa4', roster: [] }],
            knownPlayers: [{ name: 'Sam', lastUsed: 3 }, { name: 'Jo', lastUsed: 2 }, { name: 'Bea', lastUsed: 1 }],
        })
    })

    it('should suggest remembered players who are in neither team, add one to the team and remember typed names', async () => {
        render(<MatchDetails />)
        await userEvent.click(screen.getByLabelText('Team 2 roster'))
        expect(screen.queryByRole('button', { name: 'Add Sam' })).toBeNull() // already in Team 1
        await userEvent.click(screen.getByRole('button', { name: 'Add Jo' }))
        expect(useAppState.getState().teams[1].roster).toEqual(['Jo'])
        await userEvent.type(screen.getByLabelText('Team 2 roster'), 'Kit{Enter}')
        expect(useAppState.getState().knownPlayers.map((p) => p.name)).toContain('Kit')
    })

    it('should forget a suggested player', async () => {
        render(<MatchDetails />)
        await userEvent.click(screen.getByLabelText('Team 2 roster'))
        await userEvent.click(screen.getByRole('button', { name: 'Forget Bea' }))
        expect(useAppState.getState().knownPlayers.map((p) => p.name)).not.toContain('Bea')
    })
})
