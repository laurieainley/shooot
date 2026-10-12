// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'

const saved: { blob: Blob | null } = { blob: null }
vi.mock('../graphics/logoStore', () => ({
    loadCustomLogo: vi.fn(async () => saved.blob),
    saveCustomLogo: vi.fn(async (b: Blob) => { if (!b.type.startsWith('image/')) throw new Error('Pick an image file for the logo'); saved.blob = b }),
    clearCustomLogo: vi.fn(async () => { saved.blob = null }),
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
        await userEvent.type(screen.getByLabelText('Team 2 roster'), 'Jo{Enter}Alex,')
        expect(s().teams[1].roster).toEqual(['Alex', 'Jo'])
        await userEvent.click(screen.getByRole('button', { name: 'Remove Jo' }))
        expect(s().teams[1].roster).toEqual(['Alex'])
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
