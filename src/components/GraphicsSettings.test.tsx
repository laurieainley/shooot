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
        useAppState.setState({ graphics: { cards: true, lowerThirds: true, replayTag: false, scoreBug: false } })
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
        useAppState.setState({ graphics: { cards: true, lowerThirds: true, replayTag: false, scoreBug: false } })
    })

    it('should show the graphics with their current state', () => {
        render(<GraphicsSettings />)
        expect(screen.getByRole('checkbox', { name: /title & full-time cards/i })).toBeChecked()
        expect(screen.getByRole('checkbox', { name: /event captions/i })).toBeChecked()
        expect(screen.getByRole('checkbox', { name: /replay tag/i })).not.toBeChecked()
        expect(screen.getByRole('checkbox', { name: /score always on screen/i })).not.toBeChecked()
    })

    it('should warn that the score bug re-encodes the whole reel, with a time estimate', async () => {
        useAppState.setState({
            files: [{ id: 'a', name: 'a.mp4', url: '', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' }], cumulativeOffsets: [0],
            events: [{ id: 'g', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' }], lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
            replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5, reencodeSecPerSec: 0.5,
        })
        render(<GraphicsSettings />)
        expect(screen.queryByText(/re-encodes the whole reel/i)).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('checkbox', { name: /score always on screen/i }))
        expect(s().graphics.scoreBug).toBe(true)
        // reel 14 s + 10 s replay = 24 s × 0.5 = 12 s
        expect(screen.getByText(/re-encodes the whole reel, about 12 s on this device/i)).toBeInTheDocument()
    })

    it('should toggle each graphic in the store', async () => {
        render(<GraphicsSettings />)
        await userEvent.click(screen.getByRole('checkbox', { name: /title & full-time cards/i }))
        await userEvent.click(screen.getByRole('checkbox', { name: /replay tag/i }))
        expect(s().graphics).toEqual({ cards: false, lowerThirds: true, replayTag: true, scoreBug: false })
    })
})
