// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { GraphicsSettings } from './GraphicsSettings'
import { stubWebCodecs } from '../test/codecs'

const s = () => useAppState.getState()

describe('GraphicsSettings without WebCodecs (older Safari)', () => {
    let restore = (): void => undefined
    beforeEach(() => { restore = stubWebCodecs(false) })
    afterEach(() => restore())

    it('should disable the graphics and say why, promising a plain reel still renders', () => {
        useAppState.setState({ graphics: { cards: true, lowerThirds: true, replayTag: false, theme: 'shooot' } })
        render(<GraphicsSettings />)
        expect(screen.getByRole('note')).toHaveTextContent(/does not have/i)
        expect(screen.getByRole('note')).toHaveTextContent(/still renders/i)
        for (const box of screen.getAllByRole('checkbox')) {
            expect(box).toBeDisabled()
            expect(box).not.toBeChecked()
        }
    })
})

describe('GraphicsSettings', () => {
    let restore = (): void => undefined
    afterEach(() => restore())
    beforeEach(() => {
        restore = stubWebCodecs()
        useAppState.setState({ graphics: { cards: true, lowerThirds: true, replayTag: false, theme: 'shooot' } })
    })

    it('should show the graphics with their current state', () => {
        render(<GraphicsSettings />)
        expect(screen.getByRole('checkbox', { name: /title & full-time cards/i })).toBeChecked()
        expect(screen.getByRole('checkbox', { name: /event captions/i })).toBeChecked()
        expect(screen.getByRole('checkbox', { name: /replay tag/i })).not.toBeChecked()
        expect(screen.queryByRole('checkbox', { name: /score always on screen/i })).not.toBeInTheDocument()
        expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    })

    it('should toggle each graphic in the store', async () => {
        render(<GraphicsSettings />)
        await userEvent.click(screen.getByRole('checkbox', { name: /title & full-time cards/i }))
        await userEvent.click(screen.getByRole('checkbox', { name: /replay tag/i }))
        expect(s().graphics).toEqual({ cards: false, lowerThirds: true, replayTag: true, theme: 'shooot' })
    })
})

describe('GraphicsSettings theme picker', () => {
    let restore = (): void => undefined
    afterEach(() => restore())
    beforeEach(() => {
        restore = stubWebCodecs()
        useAppState.setState({ graphics: { cards: true, lowerThirds: true, replayTag: true, theme: 'shooot' } })
    })

    it('should offer the two looks with Shooot selected by default', () => {
        render(<GraphicsSettings />)
        expect(screen.getByRole('radio', { name: /shooot/i })).toBeChecked()
        expect(screen.getByRole('radio', { name: /classic/i })).not.toBeChecked()
    })

    it('should switch the look in the store and keep the other switches', async () => {
        render(<GraphicsSettings />)
        await userEvent.click(screen.getByRole('radio', { name: /classic/i }))
        expect(s().graphics).toEqual({ cards: true, lowerThirds: true, replayTag: true, theme: 'classic' })
        expect(screen.getByRole('radio', { name: /classic/i })).toBeChecked()
    })

    it('should fall back to Shooot for an unknown saved theme', () => {
        useAppState.setState({ graphics: { cards: true, lowerThirds: true, replayTag: true, theme: 'neon' as never } })
        render(<GraphicsSettings />)
        expect(screen.getByRole('radio', { name: /shooot/i })).toBeChecked()
    })
})
