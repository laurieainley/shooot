// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'
import { setCoarsePointer } from '../test/pointer'

const renderReel = vi.fn()
vi.mock('../render', () => ({ renderReel: (...a: unknown[]) => renderReel(...a) }))
vi.mock('../graphics/assets', () => ({ ensureGraphicsFonts: vi.fn(async () => true), loadLogo: vi.fn(async () => null) }))
vi.mock('../graphics/logoStore', () => ({ loadCustomLogo: vi.fn(async () => null) }))
const saved = { job: null as unknown }
vi.mock('../render/renderJob', () => ({ loadJob: vi.fn(async () => saved.job), discardJob: vi.fn(async () => { saved.job = null }) }))

import { FullMatchExport } from './FullMatchExport'
import { resetRenderJobs } from '../renderJobs'
import { fullMatchExport } from '../utils/exportPlans'

const big = (name: string, gb: number): VideoSourceFile => {
    const file = new File([''], name)
    Object.defineProperty(file, 'size', { value: gb * 1024 ** 3 })
    return { id: name, name, url: '', file, durationSec: 600, kind: 'full' }
}

describe('FullMatchExport', () => {
    beforeEach(() => {
        renderReel.mockReset()
        resetRenderJobs()
        saved.job = null
        setCoarsePointer(false)
        useAppState.setState({
            files: [big('GX010001.MP4', 1), big('GX020001.MP4', 1.5)], cumulativeOffsets: [0, 600],
            events: [
                { id: 'k', type: 'kick_off', matchTimeSec: 60, sourceFileIndex: 0 },
                { id: 'g', type: 'goal', matchTimeSec: 300, sourceFileIndex: 0, team: 'Whites', scorer: 'Sam' },
                { id: 'w', type: 'final_whistle', matchTimeSec: 540, sourceFileIndex: 1 },
            ],
            teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }],
            fullMatch: { cards: false, scoreBug: 'off', intervalMin: 5, captions: false }, matchdayLabel: null,
        })
    })

    it('should summarise the span, length and estimated size', () => {
        render(<FullMatchExport />)
        expect(screen.getByText(/Kick off 01:00 \(V1\) → Final whistle 19:00 \(V2\)/)).toBeInTheDocument()
        expect(screen.getByText(/18:00 · about 2.3 GB/)).toBeInTheDocument()
    })

    it('should say where it starts and ends when the markers are missing', () => {
        useAppState.setState({ events: [] })
        render(<FullMatchExport />)
        expect(screen.getByText(/Start of V1 → End of V2/)).toBeInTheDocument()
        expect(screen.getByText(/tag Kick off \(K\) and Final whistle \(W\)/i)).toBeInTheDocument()
    })

    it('should render kick-off to final whistle as full-match.mp4, resumable', async () => {
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<FullMatchExport />)
        await userEvent.click(screen.getByRole('button', { name: /render full match/i }))
        await waitFor(() => expect(renderReel).toHaveBeenCalled())
        const [cuts, , opts] = renderReel.mock.calls[0]
        expect(cuts).toEqual([{ sourceIndex: 0, startSec: 60, endSec: 600 }, { sourceIndex: 1, startSec: 0, endSec: 540 }])
        expect(opts.outputName).toBe('full-match.mp4')
        expect(opts.resumable).toMatchObject({ kind: 'fullMatch' })
        expect(await screen.findByText('Downloaded full-match.mp4')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Download again' })).toBeInTheDocument()
    })

    it('should set the score bug and cards', async () => {
        render(<FullMatchExport />)
        await userEvent.click(screen.getByRole('radio', { name: 'Periodic' }))
        expect(useAppState.getState().fullMatch.scoreBug).toBe('periodic')
        await userEvent.selectOptions(screen.getByRole('combobox', { name: /every/i }), '10')
        expect(useAppState.getState().fullMatch.intervalMin).toBe(10)
        await userEvent.click(screen.getByRole('checkbox', { name: /title & full-time cards/i }))
        expect(useAppState.getState().fullMatch.cards).toBe(true)
    })

    it('should warn on a phone when the file will be over 2 GB', () => {
        setCoarsePointer(true)
        render(<FullMatchExport />)
        expect(screen.getByText(/over 2 GB/i)).toBeInTheDocument()
    })

    it('should offer to resume an unfinished render of the same plan', async () => {
        const plan = fullMatchExport(useAppState.getState(), 'full')
        saved.job = { kind: 'fullMatch', signature: plan.signature, outputName: 'full-match.mp4', unitsDone: 2, unitCount: 4, done: 50, total: 100 }
        render(<FullMatchExport />)
        expect(await screen.findByRole('button', { name: 'Resume render' })).toBeInTheDocument()
        expect(screen.getByText(/stopped at 50%/)).toBeInTheDocument()
    })

    it('should only offer a fresh render when the plan changed', async () => {
        saved.job = { kind: 'fullMatch', signature: 'other', outputName: 'full-match.mp4', unitsDone: 2, unitCount: 4, done: 50, total: 100 }
        render(<FullMatchExport />)
        expect(await screen.findByText(/can’t be resumed/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Resume render' })).not.toBeInTheDocument()
    })
})
