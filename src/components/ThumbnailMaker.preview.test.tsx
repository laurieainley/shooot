// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'

const image = { naturalWidth: 1920, naturalHeight: 1080 } as HTMLImageElement
vi.mock('./thumbnailFrame', () => ({ useThumbFrame: () => ({ status: 'ready', image }) }))
vi.mock('../graphics/assets', () => ({ ensureGraphicsFonts: vi.fn(async () => true), loadLogo: vi.fn(async () => null) }))
vi.mock('../graphics/logoStore', () => ({ loadCustomLogo: vi.fn(async () => null) }))

import { ThumbnailMaker } from './ThumbnailMaker'

const file: VideoSourceFile = { id: 'f', name: 'a.mp4', kind: 'full', url: 'blob:a', file: new File([''], 'a.mp4'), durationSec: 1000 }

/** A canvas context that accepts any drawing call. */
const fakeContext = (): CanvasRenderingContext2D => new Proxy({}, {
    get: (_t, key) => {
        if (key === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 0 })
        if (key === 'createLinearGradient') return () => ({ addColorStop: () => undefined })
        return () => undefined
    },
    set: () => true,
}) as unknown as CanvasRenderingContext2D

describe('ThumbnailMaker larger preview', () => {
    beforeEach(() => {
        URL.createObjectURL = vi.fn(() => 'blob:x')
        URL.revokeObjectURL = vi.fn()
        HTMLCanvasElement.prototype.getContext = vi.fn(fakeContext) as unknown as typeof HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,AA==')
        useAppState.setState({
            files: [file], cumulativeOffsets: [0], teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f0f', roster: [] }],
            events: [{ id: 'g1', type: 'goal', matchTimeSec: 100, sourceFileIndex: 0 }],
        })
    })

    it('should open the larger preview from the magnifier, then close it with Escape or the backdrop and return focus', async () => {
        render(<ThumbnailMaker kind="highlights" />)
        await userEvent.click(screen.getByRole('button', { name: /make a thumbnail/i }))
        const magnify = screen.getByRole('button', { name: 'Preview larger' })
        await waitFor(() => expect(magnify).toBeEnabled())
        magnify.focus()
        await userEvent.click(magnify)
        const dialog = screen.getByRole('dialog', { name: 'Thumbnail preview' })
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(screen.getByRole('img', { name: /the thumbnail, larger/i })).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')
        fireEvent.keyDown(dialog, { key: 'Escape' })
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(magnify).toHaveFocus()
        await userEvent.click(magnify)
        await userEvent.click(screen.getByRole('button', { name: 'Close preview' }))
        expect(screen.queryByRole('dialog')).toBeNull()
    })
})
