// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { resetRenderJobs } from '../renderJobs'
import type { VideoSourceFile } from '../types'

const renderReel = vi.fn()
vi.mock('../render', () => ({ renderReel: (...a: unknown[]) => renderReel(...a) }))
vi.mock('../graphics/assets', () => ({ loadGraphicsFont: vi.fn(async () => true), loadLogo: vi.fn(async () => null) }))
vi.mock('../graphics/logoStore', () => ({ loadCustomLogo: vi.fn(async () => null) }))

import { RenderHighlights } from './RenderHighlights'

const proxy: VideoSourceFile = { id: 'p', name: 'GL010226.LRV', kind: 'proxy', url: '', file: new File([''], 'GL010226.LRV'), durationSec: 600 }

describe('RenderHighlights', () => {
    beforeEach(() => {
        resetRenderJobs()
        renderReel.mockReset()
        useAppState.setState({
            files: [proxy],
            events: [{ id: 'e', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' }],
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
            graphics: { cards: true, lowerThirds: true, replayTag: false, scoreBug: false },
        })
    })

    it('should show both render buttons when the timeline has proxies', () => {
        render(<RenderHighlights />)
        expect(screen.getByRole('button', { name: /preview reel/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /full quality/i })).toBeInTheDocument()
    })

    it('should list missing full files instead of rendering', async () => {
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /full quality/i }))
        expect(screen.getByText(/GL010226\.LRV/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /pick full files/i })).toBeInTheDocument()
        expect(renderReel).not.toHaveBeenCalled()
    })

    it('should render a preview from proxies and show progress then a download link', async () => {
        renderReel.mockImplementation(async (_c, _s, { onProgress }) => {
            onProgress({ cutIndex: 0, cutCount: 1, fraction: 0.5 })
            return new Blob(['x'], { type: 'video/mp4' })
        })
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview reel/i }))
        expect(renderReel).toHaveBeenCalledWith(
            [{ sourceIndex: 0, startSec: 90, endSec: 104 }, { sourceIndex: 0, startSec: 96, endSec: 101, speed: 0.5, gain: 0.5 }],
            [{ name: 'GL010226.LRV', file: proxy.file }],
            expect.objectContaining({ onProgress: expect.any(Function) }),
        )
        expect(await screen.findByRole('link', { name: /download/i })).toBeInTheDocument()
    })

    it('should leave unlinked events out of the render', async () => {
        useAppState.setState({
            events: [
                { id: 'e', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' },
                { id: 'u', matchTimeSec: 300, sourceFileIndex: 0, type: 'goal', unlinked: true, sourceFileKey: 'gone.mp4' },
            ],
        })
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview reel/i }))
        expect(renderReel.mock.calls[0][0]).toEqual([
            { sourceIndex: 0, startSec: 90, endSec: 104 },
            { sourceIndex: 0, startSec: 96, endSec: 101, speed: 0.5, gain: 0.5 },
        ])
    })

    it('should append a slow-mo replay after a goal\'s clip', async () => {
        useAppState.setState({ replayBeforeSec: 3, replayAfterSec: 1, replaySpeed: 0.5 })
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview reel/i }))
        expect(renderReel.mock.calls[0][0]).toEqual([
            { sourceIndex: 0, startSec: 90, endSec: 104 },
            { sourceIndex: 0, startSec: 97, endSec: 101, speed: 0.5, gain: 0.5 },
        ])
    })

    it('should pass title cards and a caption for the goal (carrying on over its replay) to the renderer', async () => {
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview reel/i }))
        const g = renderReel.mock.calls[0][2].graphics
        expect(g.intro.label).toBe('Title card')
        expect(g.outro.label).toBe('Full-time card')
        expect(g.overlays.map((o: { cutIndex: number; startSec: number }) => [o.cutIndex, o.startSec])).toEqual([[0, 100], [1, expect.any(Number)]])
    })

    it('should render without graphics when they are all turned off', async () => {
        useAppState.setState({ graphics: { cards: false, lowerThirds: false, replayTag: false, scoreBug: false } })
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview reel/i }))
        expect(renderReel.mock.calls[0][2].graphics).toBeUndefined()
    })

    it('should say which graphics were left out and why', async () => {
        renderReel.mockImplementation(async (_c, _s, { onGraphics }) => {
            onGraphics({ applied: ['Title card'], skipped: [{ label: 'Full-time card', reason: 'no encoder' }] })
            return new Blob(['x'], { type: 'video/mp4' })
        })
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview reel/i }))
        expect(await screen.findByText(/Full-time card/)).toBeInTheDocument()
        expect(screen.getByText(/no encoder/)).toBeInTheDocument()
    })
})
