// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { setMedia } from '../test/pointer'
import { registerPlayerRate, publishPlayerRate } from './playerControl'
import { SpeedButton } from './SpeedButton'
import { TagControls } from './TagControls'

let rate = 1
const set = vi.fn((r: number) => { rate = r; publishPlayerRate(r) })
let unregister: () => void

beforeEach(() => {
    rate = 1
    set.mockClear()
    publishPlayerRate(1)
    unregister = registerPlayerRate(() => rate, set)
    useAppState.setState({ isPreviewMode: false, files: [{ id: 'a', name: 'a.mp4', url: '', file: new File([''], 'a.mp4'), durationSec: 60, kind: 'full' }] })
    setMedia({ coarse: true, landscape: true })
})
afterEach(() => { unregister(); cleanup(); setMedia({}) })

describe('SpeedButton', () => {
    it('should show the current rate on the button', () => {
        render(<SpeedButton />)
        expect(screen.getByRole('button', { name: /Playback speed/ })).toHaveTextContent('1×')
        act(() => publishPlayerRate(0.5))
        expect(screen.getByRole('button', { name: /Playback speed/ })).toHaveTextContent('0.5×')
    })

    it('should open a list of speeds with the current one marked, set the rate through the player and close', async () => {
        render(<SpeedButton />)
        expect(screen.queryByRole('group', { name: 'Speeds' })).toBeNull()
        await userEvent.click(screen.getByRole('button', { name: /Playback speed/ }))
        const options = screen.getAllByRole('button', { pressed: undefined }).filter((b) => b.closest('[aria-label="Speeds"]'))
        expect(options.map((b) => b.textContent)).toEqual(['0.25×', '0.5×', '1×', '1.5×', '2×'])
        expect(screen.getByRole('button', { name: 'Speed 1×', pressed: true })).toBeTruthy()
        await userEvent.click(screen.getByRole('button', { name: 'Speed 2×' }))
        expect(set).toHaveBeenCalledWith(2)
        expect(screen.queryByRole('group', { name: 'Speeds' })).toBeNull()
        expect(screen.getByRole('button', { name: /Playback speed/ })).toHaveTextContent('2×')
    })

    it('should close on Escape without changing the rate', async () => {
        render(<SpeedButton />)
        await userEvent.click(screen.getByRole('button', { name: /Playback speed/ }))
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('group', { name: 'Speeds' })).toBeNull()
        expect(set).not.toHaveBeenCalled()
    })

    it('should name the shortcut keys in its title', () => {
        render(<SpeedButton />)
        expect(screen.getByRole('button', { name: /Playback speed/ }).getAttribute('title')).toMatch(/,.*\..*\//)
    })

    it('should not show on the desktop player before a video is loaded', () => {
        useAppState.setState({ files: [] })
        render(<SpeedButton variant="desk" />)
        expect(screen.queryByRole('button', { name: /Playback speed/ })).toBeNull()
    })

    it('should be hidden during the highlights preview', () => {
        useAppState.setState({ isPreviewMode: true })
        render(<SpeedButton />)
        expect(screen.queryByRole('button', { name: /Playback speed/ })).toBeNull()
    })
})

describe('TagControls speed button', () => {
    it('should sit in the left cluster in both the overlay and the portrait row', () => {
        for (const variant of ['overlay', 'portrait'] as const) {
            const { container, unmount } = render(<TagControls variant={variant} />)
            expect(container.querySelector('.tv-left [aria-label^="Playback speed"]')).toBeTruthy()
            unmount()
        }
    })

    it('should order the portrait row ⟲5 · Play · ⟳5, frame ‹ ›, speed, with Tag at the right and no Found buttons', () => {
        const { container } = render(<TagControls variant="portrait" />)
        const names = [...container.querySelectorAll('.tv-dock button')].map((b) => b.getAttribute('aria-label'))
        expect(names).toEqual(['Back 5 seconds', 'Play', 'Forward 5 seconds', 'Previous frame', 'Next frame', expect.stringMatching(/^Playback speed/), 'Tag this moment'])
        expect(container.querySelector('.tv-dock > .tv-tag:last-child')).toBeTruthy()
    })
})
