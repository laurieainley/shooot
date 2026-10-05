// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { GraphicsSettings } from './GraphicsSettings'

const s = () => useAppState.getState()

describe('GraphicsSettings', () => {
    beforeEach(() => {
        useAppState.setState({ graphics: { cards: true, lowerThirds: true, replayTag: false, scoreBug: false } })
    })

    it('should show the three graphics with their current state', () => {
        render(<GraphicsSettings />)
        expect(screen.getByRole('checkbox', { name: /title & full-time cards/i })).toBeChecked()
        expect(screen.getByRole('checkbox', { name: /lower thirds/i })).toBeChecked()
        expect(screen.getByRole('checkbox', { name: /replay tag/i })).not.toBeChecked()
    })

    it('should toggle each graphic in the store', async () => {
        render(<GraphicsSettings />)
        await userEvent.click(screen.getByRole('checkbox', { name: /title & full-time cards/i }))
        await userEvent.click(screen.getByRole('checkbox', { name: /replay tag/i }))
        expect(s().graphics).toEqual({ cards: false, lowerThirds: true, replayTag: true, scoreBug: false })
    })
})
