// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const renderReel = vi.fn()
vi.mock('../render', () => ({ renderReel: (...a: unknown[]) => renderReel(...a) }))

import { renderJobs, resetRenderJobs } from '../renderJobs'
import { RenderStatus } from './RenderStatus'

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
})
