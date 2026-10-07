// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const renderReel = vi.fn()
vi.mock('../render', () => ({ renderReel: (...a: unknown[]) => renderReel(...a) }))

import { renderJobs, resetRenderJobs } from '../renderJobs'
import { RenderStatus } from './RenderStatus'
import { RenderDiagnostics, saveLastReport, type DiagnosticsReport } from '../render/diagnostics'

const start = (kind: 'highlights' | 'fullMatch' = 'fullMatch') =>
    renderJobs().getState().start({ kind, quality: 'full' }, async () => ({ cuts: [], sources: [], outputName: 'full-match.mp4' }))

describe('RenderStatus', () => {
    beforeEach(() => {
        resetRenderJobs()
        renderReel.mockReset()
        renderReel.mockImplementation((_c, _s, o: { signal: AbortSignal }) => new Promise((_, reject) => {
            o.signal.addEventListener('abort', () => reject(new DOMException('Render cancelled', 'AbortError')))
        }))
    })

    it('should cancel a young render at once', async () => {
        const done = start()
        render(<RenderStatus kind="fullMatch" />)
        await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
        await done
        expect(renderJobs().getState().job).toBeNull()
    })

    it('should ask before cancelling a render that is more than 10 s in', async () => {
        const done = start()
        await waitFor(() => expect(renderJobs().getState().job?.phase).toBe('running'))
        renderJobs().setState({ job: { ...renderJobs().getState().job!, startedAt: Date.now() - 20_000, fraction: 0.5 } })
        render(<RenderStatus kind="fullMatch" />)
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(screen.getByText('Cancel at 50%?')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Keep rendering' }))
        expect(renderJobs().getState().job?.phase).toBe('running')
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        await userEvent.click(screen.getByRole('button', { name: 'Cancel render' }))
        await done
        expect(renderJobs().getState().job).toBeNull()
    })

    it('should show a render of the other export as running, with its own Cancel', async () => {
        void start('highlights')
        render(<RenderStatus kind="fullMatch" />)
        expect(await screen.findByText(/Rendering highlights · 0%/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('should ask about re-encoding mixed frame sizes before rendering, and carry on when confirmed', async () => {
        let answer: boolean | null = null
        renderReel.mockImplementation(async (_c, _s, o: { confirmMixedSizes: (n: string) => Promise<boolean> }) => { answer = await o.confirmMixedSizes('B.MP4 is 3840×2160. It will be scaled to 1920×1080.'); return new Blob(['x']) })
        const done = start('highlights')
        render(<RenderStatus kind="highlights" />)
        expect(await screen.findByText(/B\.MP4 is 3840×2160/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Render' }))
        await waitFor(() => expect(answer).toBe(true))
        await done
        expect(screen.queryByText(/B\.MP4 is 3840×2160/)).not.toBeInTheDocument()
    })

    it('should cancel the render when the mixed sizes notice is declined', async () => {
        renderReel.mockImplementation(async (_c, _s, o: { confirmMixedSizes: (n: string) => Promise<boolean> }) => {
            if (!(await o.confirmMixedSizes('B.MP4 is 3840×2160'))) throw new DOMException('Render cancelled', 'AbortError')
            return new Blob(['x'])
        })
        const done = start('highlights')
        render(<RenderStatus kind="highlights" />)
        await screen.findByText(/B\.MP4 is 3840×2160/)
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        await done
        expect(renderJobs().getState().job).toBeNull()
    })

    describe('diagnostics', () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        const makeReport = (kind: 'highlights' | 'fullMatch' = 'highlights', outcome: 'done' | 'failed' = 'done'): DiagnosticsReport => {
            const d = new RenderDiagnostics({ kind, outputName: 'highlights.mp4', now: () => Date.UTC(2026, 9, 7, 12, 30, 0) })
            d.graphicSkipped('Goal 3', 'the encoder changed its frame size', new Error('covers failed'))
            return d.report(outcome, outcome === 'failed' ? new Error('mux broke') : undefined)
        }
        beforeEach(() => {
            localStorage.clear()
            writeText.mockClear()
            Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        })

        it('should offer Copy diagnostics after a render and copy the readable report', async () => {
            renderReel.mockImplementation(async (_c, _s, o: { onDiagnostics: (r: DiagnosticsReport) => void; onGraphics: (r: unknown) => void }) => {
                o.onGraphics({ applied: [], skipped: [{ label: 'Goal 3', reason: 'the encoder changed its frame size' }] })
                o.onDiagnostics(makeReport())
                return new Blob(['x'])
            })
            await start('highlights')
            render(<RenderStatus kind="highlights" />)
            expect(screen.getByText(/Goal 3 — the encoder changed its frame size/)).toBeInTheDocument()
            await userEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }))
            expect(writeText).toHaveBeenCalledOnce()
            expect(writeText.mock.calls[0][0]).toContain('Shooot render diagnostics')
            expect(writeText.mock.calls[0][0]).toContain('```json')
            expect(await screen.findByText('Copied')).toBeInTheDocument()
        })

        it('should offer Copy diagnostics when the render failed', async () => {
            renderReel.mockImplementation(async (_c, _s, o: { onDiagnostics: (r: DiagnosticsReport) => void }) => {
                o.onDiagnostics(makeReport('highlights', 'failed'))
                throw new Error('mux broke')
            })
            await start('highlights')
            render(<RenderStatus kind="highlights" />)
            expect(screen.getByText(/Render failed: mux broke/)).toBeInTheDocument()
            await userEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }))
            expect(writeText.mock.calls[0][0]).toContain('Outcome: failed')
        })

        it('should keep Rendered without visible after a reload, from the saved report, with its time', () => {
            saveLastReport(makeReport())
            render(<RenderStatus kind="highlights" />)
            expect(screen.getByText('Rendered without:')).toBeInTheDocument()
            expect(screen.getByText(/Goal 3 — the encoder changed its frame size/)).toBeInTheDocument()
            expect(screen.getByText(/last render/i)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Copy diagnostics' })).toBeInTheDocument()
        })

        it('should show a saved report only in the export it belongs to', () => {
            saveLastReport(makeReport('highlights'))
            render(<RenderStatus kind="fullMatch" />)
            expect(screen.queryByRole('button', { name: 'Copy diagnostics' })).not.toBeInTheDocument()
        })

        it('should show nothing without a job or a saved report', () => {
            const { container } = render(<RenderStatus kind="highlights" />)
            expect(container).toBeEmptyDOMElement()
        })

        it('should show the text to copy by hand when the clipboard is refused', async () => {
            writeText.mockRejectedValueOnce(new Error('denied'))
            saveLastReport(makeReport())
            render(<RenderStatus kind="highlights" />)
            await userEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }))
            expect(((await screen.findByLabelText('Diagnostics report')) as HTMLTextAreaElement).value).toContain('Shooot render diagnostics')
        })
    })
})
