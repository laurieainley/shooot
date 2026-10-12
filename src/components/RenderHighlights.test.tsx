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
        expect(g.overlays.map((o: { cutIndex: number; startSec: number }) => [o.cutIndex, o.startSec])).toEqual([[0, 101], [1, expect.any(Number)]])
    })

    it('should render without graphics when they are all turned off', async () => {
        useAppState.setState({ graphics: { cards: false, lowerThirds: false, replayTag: false, theme: 'shooot' } })
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

    it('should skip the graphics up front, with the reason, when the browser has no WebCodecs, and still render the reel', async () => {
        restoreCodecs()
        restoreCodecs = stubWebCodecs(false)
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<RenderHighlights />)
        await userEvent.click(screen.getByRole('button', { name: /preview reel/i }))
        await vi.waitFor(() => expect(renderReel).toHaveBeenCalled())
        expect(renderReel.mock.calls[0][0].length).toBeGreaterThan(0) // the cuts are still rendered
        expect(renderReel.mock.calls[0][2].graphics).toBeUndefined() // …without graphics
        expect(await screen.findByText(/does not have/i)).toBeInTheDocument()
    })

    describe('output quality', () => {
        const full = (name: string, width: number, height: number): VideoSourceFile => ({ id: name, name, kind: 'full', url: '', file: new File([''], name), durationSec: 600, width, height })
        const setup = (width = 3840, height = 2160): void => {
            useAppState.setState({ files: [full('GX010001.MP4', width, height)], highlightsQuality: 'auto' })
        }
        afterEach(() => { setMedia({}); useAppState.setState({ highlightsQuality: 'auto' }) })

        it('should default to Original on a desktop and list size and time for each choice, named for the reel', () => {
            setMedia({ desktop: true })
            setup()
            render(<RenderHighlights />)
            expect(screen.getByRole('radio', { name: 'Original' })).toBeChecked()
            const list = screen.getByRole('list', { name: /output quality sizes/i })
            expect(list).toHaveTextContent(/Original about .*, roughly .* for a \d+ min reel|Original about .*, under a minute/)
            expect(list).toHaveTextContent(/1080p about/)
        })

        it('should default to 1080p on a phone until the user chooses, and then keep the choice', async () => {
            setMedia({ coarse: true, portrait: true })
            setup()
            const { unmount } = render(<RenderHighlights />)
            expect(screen.getByRole('radio', { name: '1080p' })).toBeChecked()
            expect(useAppState.getState().highlightsQuality).toBe('auto')
            await userEvent.click(screen.getByRole('radio', { name: 'Original' }))
            expect(useAppState.getState().highlightsQuality).toBe('original')
            unmount()
            render(<RenderHighlights />)
            expect(screen.getByRole('radio', { name: 'Original' })).toBeChecked()
        })

        it('should grey out 4K, saying why, when the footage is 1080p, and fall back to Original for a saved 4K choice', () => {
            setMedia({ desktop: true })
            setup(1920, 1080)
            useAppState.setState({ highlightsQuality: '4k' })
            render(<RenderHighlights />)
            expect(screen.getByRole('radio', { name: '4K' })).toBeDisabled()
            expect(screen.getByRole('radio', { name: 'Original' })).toBeChecked()
            expect(screen.getByRole('list', { name: /output quality sizes/i })).toHaveTextContent(/4K unavailable: The footage is 1920×1080, not 4K/)
        })

        it('should pass the chosen output to the renderer, under its own signature', async () => {
            setMedia({ desktop: true })
            setup()
            renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
            render(<RenderHighlights />)
            await userEvent.click(screen.getByRole('radio', { name: '4K' }))
            await userEvent.click(screen.getByRole('button', { name: /render mp4 as 4k/i }))
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
            await userEvent.click(screen.getByRole('button', { name: /render mp4/i }))
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
                await waitFor(() => expect(screen.getByRole('radio', { name: 'Original' })).toBeDisabled())
                expect(screen.getByRole('radio', { name: '4K' })).toBeChecked()
                expect(screen.getByRole('list', { name: /output quality sizes/i })).toHaveTextContent(/Too big for this browser’s storage/)
                expect(screen.getByText(/Original would not fit in this browser’s storage, so 4K is selected/)).toBeInTheDocument()
            })
        })
    })
})
