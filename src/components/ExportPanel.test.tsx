// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { resetRenderJobs } from '../renderJobs'
import type { VideoSourceFile } from '../types'

const renderReel = vi.fn()
vi.mock('../render', () => ({ renderReel: (...a: unknown[]) => renderReel(...a) }))
vi.mock('../graphics/assets', () => ({ loadGraphicsFont: vi.fn(async () => true), loadLogo: vi.fn(async () => null) }))
vi.mock('../graphics/logoStore', () => ({ loadCustomLogo: vi.fn(async () => null) }))

import { ExportPanel } from './ExportPanel'

const proxy: VideoSourceFile = { id: 'p', name: 'GL010226.LRV', kind: 'proxy', url: '', file: new File([''], 'GL010226.LRV'), durationSec: 600 }

describe('ExportPanel', () => {
    beforeEach(() => {
        resetRenderJobs()
        useAppState.setState({
            files: [proxy], cumulativeOffsets: [0], isPreviewMode: false, previewSegments: [], currentPreviewSegment: 0, panel: null,
            events: [{ id: 'e', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' }],
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, exportTab: 'highlights',
        })
    })

    it('should be closed until the Export button is pressed', () => {
        render(<ExportPanel />)
        expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument()
    })

    it('should show preview, render and description sections when opened (project import/export lives in ⋯)', async () => {
        render(<ExportPanel />)
        await userEvent.click(screen.getByRole('button', { name: 'Export' }))
        const dialog = screen.getByRole('dialog', { name: 'Export' })
        expect(dialog).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /preview in player/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /preview reel/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /full quality/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /copy highlights description/i })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /export project/i })).not.toBeInTheDocument()
    })

    it('should have Export highlights and Export full match tabs', async () => {
        render(<ExportPanel />)
        await userEvent.click(screen.getByRole('button', { name: 'Export' }))
        const highlights = screen.getByRole('tab', { name: 'Export highlights' })
        expect(highlights).toHaveAttribute('aria-selected', 'true')
        await userEvent.click(screen.getByRole('tab', { name: 'Export full match' }))
        expect(screen.getByRole('tab', { name: 'Export full match' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('tabpanel', { name: 'Export full match' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /render full match/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Copy full match description' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /preview in player/i })).not.toBeInTheDocument()
        await userEvent.keyboard('{ArrowLeft}')
        expect(screen.getByRole('tab', { name: 'Export highlights' })).toHaveAttribute('aria-selected', 'true')
    })

    it('should keep a render going when the panel closes and show its progress when it opens again', async () => {
        let finish!: (b: Blob) => void
        renderReel.mockImplementation((_c: unknown, _s: unknown, o: { onProgress: (p: unknown) => void }) => {
            o.onProgress({ cutIndex: 0, cutCount: 1, fraction: 0.42 })
            return new Promise<Blob>((r) => { finish = r })
        })
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
        render(<ExportPanel />)
        await userEvent.click(screen.getByRole('button', { name: 'Export' }))
        await userEvent.click(screen.getByRole('button', { name: /preview reel/i }))
        expect(await screen.findByText(/42%/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument()
        useAppState.setState({ currentTimeInFileSec: 12, panel: 'files' })
        useAppState.setState({ panel: null })
        await userEvent.click(screen.getByRole('button', { name: 'Export' }))
        expect(screen.getByText(/42%/)).toBeInTheDocument()
        expect(screen.getByText(/keep this screen open/i)).toBeInTheDocument()
        finish(new Blob(['x'], { type: 'video/mp4' }))
        expect(await screen.findByText('Downloaded highlights-preview.mp4')).toBeInTheDocument()
        expect(click).toHaveBeenCalledTimes(1)
        click.mockRestore()
    })

    it('should start the in-player preview and close itself', async () => {
        render(<ExportPanel />)
        await userEvent.click(screen.getByRole('button', { name: 'Export' }))
        await userEvent.click(screen.getByRole('button', { name: /preview in player/i }))
        expect(useAppState.getState().isPreviewMode).toBe(true)
        expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument()
    })

    it('should close on Escape', async () => {
        render(<ExportPanel />)
        await userEvent.click(screen.getByRole('button', { name: 'Export' }))
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument()
    })
})
