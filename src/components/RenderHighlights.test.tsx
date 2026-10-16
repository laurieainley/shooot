// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { resetRenderJobs } from '../renderJobs'
import type { VideoSourceFile } from '../types'
import { stubWebCodecs } from '../test/codecs'
import { setMedia } from '../test/pointer'
import { highlightsExport, planOutput } from '../utils/exportPlans'

const renderReel = vi.fn()
vi.mock('../render', () => ({ renderReel: (...a: unknown[]) => renderReel(...a) }))
vi.mock('../graphics/assets', () => ({ ensureGraphicsFonts: vi.fn(async () => true), loadLogo: vi.fn(async () => null), loadWordmark: vi.fn(async () => null) }))
vi.mock('../graphics/logoStore', () => ({ loadCustomLogo: vi.fn(async () => null) }))

import { RenderHighlights } from './RenderHighlights'

const proxy: VideoSourceFile = { id: 'p', name: 'GL010226.LRV', kind: 'proxy', url: '', file: new File([''], 'GL010226.LRV'), durationSec: 600 }

describe('RenderHighlights', () => {
    let restoreCodecs = (): void => undefined
    afterEach(() => restoreCodecs())
    beforeEach(() => {
        restoreCodecs = stubWebCodecs()
        resetRenderJobs()
        renderReel.mockReset()
        useAppState.setState({
            files: [proxy],
            events: [{ id: 'e', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' }],
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
            graphics: { cards: true, lowerThirds: true, replayTag: false, theme: 'shooot' },
        })
    })

    it('should show both render buttons when the timeline has proxies', () => {
        render(<RenderHighlights />)
        expect(screen.getByRole('button', { name: /preview with proxies/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /render highlights/i })).toBeInTheDocument()
    })

    it('should list missing full files instead of rendering', async () => {
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /render highlights/i }))
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
        await userEvent.click(screen.getByRole('button', { name: /preview with proxies/i }))
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
        await userEvent.click(screen.getByRole('button', { name: /preview with proxies/i }))
        expect(renderReel.mock.calls[0][0]).toEqual([
            { sourceIndex: 0, startSec: 90, endSec: 104 },
            { sourceIndex: 0, startSec: 96, endSec: 101, speed: 0.5, gain: 0.5 },
        ])
    })

    it('should append a slow-mo replay after a goal\'s clip', async () => {
        useAppState.setState({ replayBeforeSec: 3, replayAfterSec: 1, replaySpeed: 0.5 })
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview with proxies/i }))
        expect(renderReel.mock.calls[0][0]).toEqual([
            { sourceIndex: 0, startSec: 90, endSec: 104 },
            { sourceIndex: 0, startSec: 97, endSec: 101, speed: 0.5, gain: 0.5 },
        ])
    })

    it('should pass title cards and a caption for the goal (carrying on over its replay) to the renderer', async () => {
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview with proxies/i }))
        const g = renderReel.mock.calls[0][2].graphics
        expect(g.intro.label).toBe('Title card')
        expect(g.outro.label).toBe('Full-time card')
        expect(g.overlays.map((o: { cutIndex: number; startSec: number }) => [o.cutIndex, o.startSec])).toEqual([[0, 101], [1, expect.any(Number)]])
    })

    it('should render without graphics when they are all turned off', async () => {
        useAppState.setState({ graphics: { cards: false, lowerThirds: false, replayTag: false, theme: 'shooot' } })
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview with proxies/i }))
        expect(renderReel.mock.calls[0][2].graphics).toBeUndefined()
    })

    it('should say which graphics were left out and why', async () => {
        renderReel.mockImplementation(async (_c, _s, { onGraphics }) => {
            onGraphics({ applied: ['Title card'], skipped: [{ label: 'Full-time card', reason: 'no encoder' }] })
            return new Blob(['x'], { type: 'video/mp4' })
        })
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview with proxies/i }))
        expect(await screen.findByText(/Full-time card/)).toBeInTheDocument()
        expect(screen.getByText(/no encoder/)).toBeInTheDocument()
    })

    it('should skip the graphics up front, with the reason, when the browser has no WebCodecs, and still render the reel', async () => {
        restoreCodecs()
        restoreCodecs = stubWebCodecs(false)
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview with proxies/i }))
        await vi.waitFor(() => expect(renderReel).toHaveBeenCalled())
        expect(renderReel.mock.calls[0][0].length).toBeGreaterThan(0) // the cuts are still rendered
        expect(renderReel.mock.calls[0][2].graphics).toBeUndefined() // …without graphics
        expect(await screen.findByText(/does not have/i)).toBeInTheDocument()
    })

    it('should name the primary button the same with or without proxies, and say Preview with proxies for the quiet one', () => {
        render(<RenderHighlights />)
        expect(screen.getByRole('button', { name: 'Render highlights' })).toHaveClass('btn-primary')
        expect(screen.getByRole('button', { name: 'Preview with proxies' })).toHaveClass('btn-quiet')
        expect(screen.queryByRole('button', { name: /full quality|mp4/i })).not.toBeInTheDocument()
    })

    it('should explain the three qualities in one line each behind What’s the difference?', async () => {
        render(<RenderHighlights />)
        expect(screen.queryByText(/The camera’s video, untouched/)).not.toBeInTheDocument()
        const help = screen.getByRole('button', { name: 'What’s the difference?' })
        expect(help).toHaveAttribute('aria-expanded', 'false')
        await userEvent.click(help)
        expect(help).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText(/The camera’s video, untouched; only replays and graphics are re-encoded\. Largest file\./)).toBeInTheDocument()
        expect(screen.getByText(/Re-encoded to H\.264 4K, cut exactly at each clip\./)).toBeInTheDocument()
        expect(screen.getByText(/Re-encoded to H\.264 1080p, cut exactly at each clip\. Smallest file\./)).toBeInTheDocument()
    })

    describe('output quality', () => {
        const full = (name: string, width: number, height: number): VideoSourceFile => ({ id: name, name, kind: 'full', url: '', file: new File([''], name), durationSec: 600, width, height })
        const setup = (width = 3840, height = 2160): void => {
            useAppState.setState({ files: [full('GX010001.MP4', width, height)], highlightsQuality: 'auto' })
        }
        afterEach(() => { setMedia({}); useAppState.setState({ highlightsQuality: 'auto' }) })

        it('should default to Original on a desktop and show each choice\'s size under its label, and one size and time line for the chosen one', () => {
            setMedia({ desktop: true })
            setup()
            render(<RenderHighlights />)
            expect(screen.getByRole('radio', { name: /^Original/ })).toBeChecked()
            expect(screen.getByRole('radio', { name: /^Original \d+ MB$/ })).toBeInTheDocument()
            expect(screen.getByRole('radio', { name: /^1080p \d+ MB$/ })).toBeInTheDocument()
            expect(screen.getByRole('radio', { name: /^4K \d+ MB$/ })).toBeInTheDocument()
            // 10 min reel, desktop Original 0.4-0.6x -> about 5 min
            expect(screen.getByText(/^About \d+ MB · (about \d+ min|under a minute)( on this device)?$/)).toBeInTheDocument()
            expect(screen.queryByRole('list', { name: /output quality sizes/i })).not.toBeInTheDocument()
        })

        it('should default to 1080p on a phone until the user chooses, and then keep the choice', async () => {
            setMedia({ coarse: true, portrait: true })
            setup()
            const { unmount } = render(<RenderHighlights />)
            expect(screen.getByRole('radio', { name: /^1080p/ })).toBeChecked()
            expect(useAppState.getState().highlightsQuality).toBe('auto')
            await userEvent.click(screen.getByRole('radio', { name: /^Original/ }))
            expect(useAppState.getState().highlightsQuality).toBe('original')
            unmount()
            render(<RenderHighlights />)
            expect(screen.getByRole('radio', { name: /^Original/ })).toBeChecked()
        })

        it('should grey out 4K, saying why, when the footage is 1080p, and fall back to Original for a saved 4K choice', () => {
            setMedia({ desktop: true })
            setup(1920, 1080)
            useAppState.setState({ highlightsQuality: '4k' })
            render(<RenderHighlights />)
            expect(screen.getByRole('radio', { name: /^4K/ })).toBeDisabled()
            expect(screen.getByRole('radio', { name: /^Original/ })).toBeChecked()
            expect(screen.getByRole('radio', { name: /^4K/ }).closest('label')).toHaveTextContent('needs 4K footage')
            expect(screen.getByRole('radio', { name: /^4K/ }).closest('label')).toHaveAttribute('title', 'The footage is 1920×1080, not 4K.')
        })

        it('should pass the chosen output to the renderer, under its own signature', async () => {
            setMedia({ desktop: true })
            setup()
            renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
            render(<RenderHighlights />)
            await userEvent.click(screen.getByRole('radio', { name: /^4K/ }))
            await userEvent.click(screen.getByRole('button', { name: 'Render highlights · 4K' }))
            await waitFor(() => expect(renderReel).toHaveBeenCalled())
            expect(renderReel.mock.calls[0][2].output).toEqual({ quality: '4k', videoBitrate: 20_000_000 })
            const st = useAppState.getState()
            expect(highlightsExport(st, 'full', planOutput('4k')).signature).not.toBe(highlightsExport(st, 'full').signature)
        })

        it('should stream copy (no output) for Original', async () => {
            setMedia({ desktop: true })
            setup()
            renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
            render(<RenderHighlights />)
            await userEvent.click(screen.getByRole('button', { name: 'Render highlights' }))
            await waitFor(() => expect(renderReel).toHaveBeenCalled())
            expect(renderReel.mock.calls[0][2].output).toBeUndefined()
        })

        describe('storage fit', () => {
            const stubStorage = (estimate: unknown): void => { Object.defineProperty(navigator, 'storage', { value: { estimate, getDirectory: async () => { throw new Error('no opfs') } }, configurable: true }) }
            afterEach(() => { Reflect.deleteProperty(navigator, 'storage') })

            it('should grey out options too big for the browser’s storage and pick the largest that fits', async () => {
                setMedia({ desktop: true })
                setup()
                useAppState.setState({ files: [{ ...full('GX010001.MP4', 3840, 2160), file: Object.assign(new File([''], 'GX010001.MP4'), {}) }] })
                Object.defineProperty(useAppState.getState().files[0].file, 'size', { value: 40e9 })
                stubStorage(async () => ({ quota: 500e6, usage: 0 }))
                render(<RenderHighlights />)
                await waitFor(() => expect(screen.getByRole('radio', { name: /^Original/ })).toBeDisabled())
                expect(screen.getByRole('radio', { name: /^4K/ })).toBeChecked()
                expect(screen.getByRole('radio', { name: /^Original/ }).closest('label')).toHaveTextContent('too big')
                expect(screen.getByText(/Original would not fit in this browser’s storage, so 4K is selected/)).toBeInTheDocument()
            })
        })
    })
})

describe('RenderHighlights save to file', () => {
    afterEach(() => { delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker })
    it('should not offer it without the save picker', () => {
        render(<RenderHighlights />)
        expect(screen.queryByRole('button', { name: /save to file/i })).toBeNull()
    })
    it('should open the picker and render into the chosen file', async () => {
        const handle = { name: 'mine.mp4' }
        const picker = vi.fn(async () => handle)
        ;(globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker = picker
        useAppState.setState({ files: [{ ...proxy, kind: 'full' }] })
        renderReel.mockResolvedValue(new File(['x'], 'mine.mp4'))
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /save to file/i }))
        await waitFor(() => expect(renderReel).toHaveBeenCalled())
        expect(picker).toHaveBeenCalled()
        const opts = renderReel.mock.calls[0][2]
        expect(opts.experiments.targetFile).toBe(handle)
        expect(opts.resumable).toBeUndefined()
    })
})
