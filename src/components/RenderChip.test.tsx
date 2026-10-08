// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { useAppState } from '../state'
import { renderJobs, resetRenderJobs, type RenderJob } from '../renderJobs'
import { RenderChip } from './RenderChip'

const job = (p: Partial<RenderJob>): RenderJob => ({
    id: 1, kind: 'fullMatch', quality: 'full', phase: 'running', startedAt: 0, fraction: 0.42, status: '', report: null, result: null, error: null, finishedAt: null, ...p,
})

describe('RenderChip', () => {
    beforeEach(() => { resetRenderJobs(); useAppState.setState({ panel: null, exportTab: 'highlights' }) })
    afterEach(() => vi.useRealTimers())

    it('should show nothing without a render', () => {
        const { container } = render(<RenderChip />)
        expect(container).toBeEmptyDOMElement()
    })

    it('should show the progress and open Export on the render’s tab', () => {
        renderJobs().setState({ job: job({}) })
        render(<RenderChip />)
        fireEvent.click(screen.getByRole('button', { name: /polishing… 42%/i }))
        expect(useAppState.getState()).toMatchObject({ panel: 'export', exportTab: 'fullMatch' })
    })

    it('should say the reel is ready briefly after the render finishes', () => {
        vi.useFakeTimers()
        renderJobs().setState({ job: job({ phase: 'done', finishedAt: Date.now() }) })
        render(<RenderChip />)
        expect(screen.getByRole('button', { name: /reel ready/i })).toBeInTheDocument()
        act(() => { vi.advanceTimersByTime(5000) })
        expect(screen.queryByRole('button', { name: /reel ready/i })).not.toBeInTheDocument()
    })
})
