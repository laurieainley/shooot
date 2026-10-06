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

import { MatchGraphicsSetup } from './MatchGraphicsSetup'

const s = () => useAppState.getState()

describe('MatchGraphicsSetup', () => {
    beforeEach(() => {
        saved.blob = null
        URL.createObjectURL = vi.fn(() => 'blob:logo')
        URL.revokeObjectURL = vi.fn()
        useAppState.setState({
            teams: [{ name: "Ryan's Rovers", color: '#f0f0f0', roster: [] }, { name: 'Walford Town', color: '#ec5fa4', roster: [] }],
            matchdayLabel: null,
        })
    })

    it('should show an example matchday as a placeholder only and keep an edited one', () => {
        render(<MatchGraphicsSetup />)
        const field = screen.getByLabelText('Matchday')
        expect(field).toHaveAttribute('placeholder', 'e.g. Matchday 3')
        expect(field).toHaveValue('')
        fireEvent.change(field, { target: { value: 'Cup final' } })
        fireEvent.blur(field)
        expect(s().matchdayLabel).toBe('Cup final')
    })

    it('should suggest initials from the team names and store edits', () => {
        render(<MatchGraphicsSetup />)
        const rr = screen.getByLabelText("Ryan's Rovers initials")
        expect(rr).toHaveAttribute('placeholder', 'RR')
        fireEvent.change(screen.getByLabelText('Walford Town initials'), { target: { value: 'wft' } })
        expect(s().teams[1].initials).toBe('WFT')
    })

    it('should show the default logo and let a picked image replace it', async () => {
        render(<MatchGraphicsSetup />)
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
