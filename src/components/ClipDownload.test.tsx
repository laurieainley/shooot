// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { renderJobs, resetRenderJobs } from '../renderJobs'
import type { MatchEvent, VideoSourceFile } from '../types'
import { stubWebCodecs } from '../test/codecs'
import { RenderDiagnostics } from '../render/diagnostics'

const renderReel = vi.fn()
vi.mock('../render', () => ({ renderReel: (...a: unknown[]) => renderReel(...a) }))
vi.mock('../graphics/assets', () => ({ ensureGraphicsFonts: vi.fn(async () => true), loadLogo: vi.fn(async () => null), loadWordmark: vi.fn(async () => null) }))
vi.mock('../graphics/logoStore', () => ({ loadCustomLogo: vi.fn(async () => null) }))

import { ClipDownload } from './ClipDownload'

const full: VideoSourceFile = { id: 'f', name: 'GX010226.MP4', kind: 'full', url: '', file: new File([''], 'GX010226.MP4'), durationSec: 600 }
const goal: MatchEvent = { id: 'a', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal', team: 'Whites' }
const save: MatchEvent = { id: 's', matchTimeSec: 200, sourceFileIndex: 0, type: 'save' }

const open = async (): Promise<void> => { await userEvent.click(screen.getByRole('button', { name: 'Download clip' })) }

describe('ClipDownload', () => {
    let restoreCodecs = (): void => undefined
    afterEach(() => restoreCodecs())
    beforeEach(() => {
        restoreCodecs = stubWebCodecs()
        resetRenderJobs()
        renderReel.mockReset()
        renderReel.mockImplementation(() => new Promise(() => undefined))
        useAppState.setState({ files: [full], events: [goal, save], teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#c00', roster: [] }], clipOptions: { score: true, replay: true } })
    })

    it('should offer Score and Replay for a goal and start a clip render', async () => {
        render(<ClipDownload event={goal} />)
        await open()
        expect(screen.getByRole('checkbox', { name: 'Score' })).toBeChecked()
        expect(screen.getByRole('checkbox', { name: 'Replay' })).toBeChecked()
        await userEvent.click(screen.getByRole('button', { name: 'Download' }))
        expect(renderJobs().getState().job).toMatchObject({ kind: 'clip', quality: 'full' })
        await waitFor(() => expect(renderReel).toHaveBeenCalled())
        expect(renderReel.mock.calls[0][2]).toMatchObject({ kind: 'clip' })
    })

    it('should hide Replay for an event without one and Score without teams', async () => {
        useAppState.setState({ teams: [] })
        render(<ClipDownload event={save} />)
        await open()
        expect(screen.queryByRole('checkbox', { name: 'Replay' })).toBeNull()
        expect(screen.queryByRole('checkbox', { name: 'Score' })).toBeNull()
    })

    it('should remember the options', async () => {
        render(<ClipDownload event={goal} />)
        await open()
        await userEvent.click(screen.getByRole('checkbox', { name: 'Score' }))
        expect(useAppState.getState().clipOptions.score).toBe(false)
    })

    it('should not start a second render while one runs', async () => {
        void renderJobs().getState().start({ kind: 'highlights', quality: 'full' }, async () => ({ cuts: [], sources: [], outputName: 'h.mp4' }))
        render(<ClipDownload event={goal} />)
        await open()
        expect(screen.getByText('A render is in progress')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
    })

    it('should ask for the videos when none are loaded (after a reload)', async () => {
        useAppState.setState({ files: [] })
        render(<ClipDownload event={goal} />)
        await open()
        expect(screen.getByRole('status').textContent).toBe('Load the match videos first')
        expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
    })

    it('should ask to relink an unlinked event', async () => {
        render(<ClipDownload event={{ ...goal, unlinked: true }} />)
        await open()
        expect(screen.getByText('Relink the file first')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
    })

    it('should use the preview files and say so when full files are not loaded', async () => {
        useAppState.setState({ files: [{ ...full, kind: 'proxy', name: 'GL010226.LRV' }] })
        render(<ClipDownload event={goal} />)
        await open()
        expect(screen.getByText(/Full-quality files aren't loaded/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Download' }))
        expect(renderJobs().getState().job).toMatchObject({ kind: 'clip', quality: 'preview' })
    })

    it('should show the clip job progress, then the file being downloaded', async () => {
        render(<ClipDownload event={goal} />)
        await open()
        await userEvent.click(screen.getByRole('button', { name: 'Download' }))
        await waitFor(() => expect(renderReel).toHaveBeenCalled())
        renderReel.mock.calls[0][2].onProgress({ cutIndex: 0, cutCount: 1, fraction: 0.4 })
        expect(await screen.findByText(/Rendering clip · 40%/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
    })

    it('should show the file name when the clip is done', async () => {
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<ClipDownload event={goal} />)
        await open()
        await userEvent.click(screen.getByRole('button', { name: 'Download' }))
        expect(await screen.findByText(/Downloading .+\.mp4/)).toBeInTheDocument()
    })

    it('should show the error when the clip failed', async () => {
        renderReel.mockRejectedValue(new Error('decoder fell over'))
        render(<ClipDownload event={goal} />)
        await open()
        await userEvent.click(screen.getByRole('button', { name: 'Download' }))
        expect(await screen.findByText(/decoder fell over/)).toBeInTheDocument()
    })

    const finishWith = async (opts: { skipped?: { label: string; reason: string }[]; fail?: string } = {}): Promise<void> => {
        renderReel.mockImplementation(async (...a: unknown[]) => {
            const o = a[2] as { onGraphics: (r: unknown) => void; onDiagnostics: (d: unknown) => void }
            o.onGraphics({ skipped: opts.skipped ?? [] })
            const d = new RenderDiagnostics({ kind: 'clip', outputName: 'c.mp4' })
            o.onDiagnostics(opts.fail ? d.report('failed', new Error(opts.fail)) : d.report('done'))
            if (opts.fail) throw new Error(opts.fail)
            return new Blob(['x'], { type: 'video/mp4' })
        })
        render(<ClipDownload event={goal} />)
        await open()
        await userEvent.click(screen.getByRole('button', { name: 'Download' }))
    }

    it('should list what the clip was rendered without, with Copy diagnostics and Download again', async () => {
        await finishWith({ skipped: [{ label: 'Shooot sting', reason: 'wordmark missing' }] })
        expect(await screen.findByText(/Rendered without/)).toBeInTheDocument()
        expect(screen.getByText(/Shooot sting — wordmark missing/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Copy diagnostics' })).toBeInTheDocument()
        const again = vi.spyOn(renderJobs().getState(), 'downloadAgain').mockImplementation(() => undefined)
        await userEvent.click(screen.getByRole('button', { name: 'Download again' }))
        expect(again).toHaveBeenCalled()
    })

    it('should make Download again the primary button and Render again quiet once the clip is done', async () => {
        await finishWith()
        const again = await screen.findByRole('button', { name: 'Download again' })
        expect(again).toHaveClass('btn-primary')
        const render2 = screen.getByRole('button', { name: 'Render again' })
        expect(render2).toHaveClass('btn-quiet')
        expect(render2).not.toHaveClass('btn-primary')
        expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
        expect(again.compareDocumentPosition(render2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('should keep the lime Download after an error and render again from Render again', async () => {
        renderReel.mockRejectedValue(new Error('decoder fell over'))
        render(<ClipDownload event={goal} />)
        await open()
        await userEvent.click(screen.getByRole('button', { name: 'Download' }))
        await screen.findByText(/decoder fell over/)
        expect(screen.getByRole('button', { name: 'Download' })).toHaveClass('btn-primary')
        expect(screen.queryByRole('button', { name: 'Render again' })).toBeNull()
    })

    it('should offer Share when the browser can share the file', async () => {
        Object.assign(navigator, { canShare: () => true, share: vi.fn(async () => undefined) })
        try {
            await finishWith()
            await userEvent.click(await screen.findByRole('button', { name: 'Share' }))
            expect(navigator.share).toHaveBeenCalled()
        } finally {
            Reflect.deleteProperty(navigator, 'canShare'); Reflect.deleteProperty(navigator, 'share')
        }
    })

    it('should show the error with Copy diagnostics when the clip failed', async () => {
        await finishWith({ fail: 'decoder fell over' })
        expect(await screen.findByText(/decoder fell over/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Copy diagnostics' })).toBeInTheDocument()
    })

    it('should show the mixed-frame-size notice and answer it', async () => {
        const answer = vi.fn()
        renderReel.mockImplementation((...a: unknown[]) => (a[2] as { confirmMixedSizes: (n: string) => Promise<boolean> }).confirmMixedSizes('Files differ in size.').then((ok) => { answer(ok); return new Blob(['x']) }))
        render(<ClipDownload event={goal} />)
        await open()
        await userEvent.click(screen.getByRole('button', { name: 'Download' }))
        expect(await screen.findByText('Files differ in size.')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Render' }))
        await waitFor(() => expect(answer).toHaveBeenCalledWith(true))
    })

    it('should cancel the render from the mixed-size notice', async () => {
        const answer = vi.fn()
        renderReel.mockImplementation((...a: unknown[]) => (a[2] as { confirmMixedSizes: (n: string) => Promise<boolean> }).confirmMixedSizes('Files differ in size.').then((ok) => { answer(ok); throw new Error('cancelled') }))
        render(<ClipDownload event={goal} />)
        await open()
        await userEvent.click(screen.getByRole('button', { name: 'Download' }))
        await screen.findByText('Files differ in size.')
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(answer).toHaveBeenCalledWith(false))
    })

    it('should ignore Space and G window shortcuts on a focused popover checkbox', async () => {
        const { shortcutFor, shouldHandleShortcut } = await import('../utils/shortcuts')
        render(<ClipDownload event={goal} />)
        await open()
        const box = screen.getByRole('checkbox', { name: 'Score' })
        box.focus()
        for (const key of [' ', 'g', 'ArrowRight']) {
            expect(shortcutFor(new KeyboardEvent('keydown', { key }))).not.toBeNull()
            expect(shouldHandleShortcut(box, { modalOpen: false })).toBe(false)
        }
        await userEvent.keyboard(' ')
        expect(useAppState.getState().clipOptions.score).toBe(false)
    })
})
