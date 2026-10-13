// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'
import { setCoarsePointer } from '../test/pointer'

const renderReel = vi.fn()
vi.mock('../render', () => ({ renderReel: (...a: unknown[]) => renderReel(...a) }))
vi.mock('../graphics/assets', () => ({ ensureGraphicsFonts: vi.fn(async () => true), loadLogo: vi.fn(async () => null), loadWordmark: vi.fn(async () => null) }))
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
        localStorage.clear()
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
            fullMatch: { cards: false, scoreBug: 'off', intervalMin: 5, captions: false, replays: false, quality: 'original' }, matchdayLabel: null,
        })
    })

    it('should name the keys for Kick off and Final whistle only when there is a keyboard', () => {
        useAppState.setState({ events: [{ id: 'g', type: 'goal', matchTimeSec: 300, sourceFileIndex: 0, team: 'Whites' }] })
        const { unmount } = render(<FullMatchExport />)
        expect(screen.getByText('Tag Kick off (K) and Final whistle (W) to trim the warm-up and the end.')).toBeInTheDocument()
        unmount()
        setCoarsePointer(true)
        render(<FullMatchExport />)
        expect(screen.getByText('Tag Kick off and Final whistle to trim the warm-up and the end.')).toBeInTheDocument()
    })

    it('should summarise the span, length and estimated size', () => {
        render(<FullMatchExport />)
        expect(screen.queryByText(/→/)).not.toBeInTheDocument() // just the length and size
        expect(screen.getByRole('group', { name: 'Full match summary' })).toHaveTextContent('18:00 · Kick off to Final whistle')
        expect(screen.getByText(/^About 2\.3 GB · (quick|under a minute|about \d+ min)( on this device)?$/)).toBeInTheDocument()
    })

    it('should keep the cards, captions, replays and score bug behind one collapsed row with a one-line summary', async () => {
        useAppState.setState({ fullMatch: { ...useAppState.getState().fullMatch, cards: true, captions: true, replays: true, scoreBug: 'goals' } })
        render(<FullMatchExport />)
        const row = screen.getByRole('button', { name: /^Included/ })
        expect(row).toHaveAttribute('aria-expanded', 'false')
        expect(row).toHaveTextContent('cards, captions, replays, score bug after goals')
        expect(screen.queryByRole('checkbox', { name: /event captions/i })).not.toBeInTheDocument()
        await userEvent.click(row)
        expect(screen.getByRole('checkbox', { name: /event captions/i })).toBeInTheDocument()
    })

    it('should say where it starts and ends when the markers are missing', () => {
        useAppState.setState({ events: [] })
        render(<FullMatchExport />)
        expect(screen.getByText(/tag Kick off \(K\) and Final whistle \(W\)/i)).toBeInTheDocument()
    })

    it('should render kick-off to final whistle named by score, resumable', async () => {
        renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
        render(<FullMatchExport />)
        await userEvent.click(screen.getByRole('button', { name: /render full match/i }))
        await waitFor(() => expect(renderReel).toHaveBeenCalled())
        const [cuts, , opts] = renderReel.mock.calls[0]
        expect(cuts).toEqual([{ sourceIndex: 0, startSec: 60, endSec: 600 }, { sourceIndex: 1, startSec: 0, endSec: 540 }])
        expect(opts.outputName).toBe('Whites 1-0 Colours (full match).mp4')
        expect(opts.resumable).toMatchObject({ kind: 'fullMatch' })
        expect(await screen.findByText('Whites 1-0 Colours (full match).mp4')).toBeInTheDocument()
        expect(screen.getByText(/^Downloading/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Download again' })).toBeInTheDocument()
    })

    it('should set the score bug and cards', async () => {
        render(<FullMatchExport />)
        expect(screen.queryByRole('radio', { name: 'Periodic' })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: /^Included/ }))
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

    describe('output quality', () => {
        const withSize = (width: number, height: number): void => {
            useAppState.setState({ files: useAppState.getState().files.map((f) => ({ ...f, width, height })) })
        }

        it('should default to Original, show each size under its label and one size and time line', async () => {
            withSize(3840, 2160)
            render(<FullMatchExport />)
            expect(screen.getByRole('radio', { name: /^Original/ })).toBeChecked()
            expect(screen.getByRole('radio', { name: 'Original 2.3 GB' })).toBeChecked()
            expect(screen.getByRole('radio', { name: /^4K .* GB$/ })).toBeInTheDocument()
            expect(screen.getByRole('radio', { name: /^1080p .* GB$/ })).toBeInTheDocument()
            expect(screen.getByText(/^About 2\.3 GB · (quick|under a minute|about \d+ min)( on this device)?$/)).toBeInTheDocument()
            await userEvent.click(screen.getByRole('radio', { name: /^1080p/ }))
            expect(screen.getByText(/^About .* GB · about \d+ min( on this device)?$/)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Render full match · 1080p' })).toHaveClass('btn-primary')
        })

        it('should grey out 4K, saying why, when the footage is 1080p', () => {
            withSize(1920, 1080)
            render(<FullMatchExport />)
            expect(screen.getByRole('radio', { name: /^4K/ })).toBeDisabled()
            expect(screen.getByRole('radio', { name: /^1080p/ })).toBeEnabled()
            expect(screen.getByRole('radio', { name: /^4K/ }).closest('label')).toHaveTextContent('needs 4K footage')
        })

        it('should render with the chosen quality, resumable under its own signature', async () => {
            withSize(3840, 2160)
            renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
            render(<FullMatchExport />)
            await userEvent.click(screen.getByRole('radio', { name: /^1080p/ }))
            expect(useAppState.getState().fullMatch.quality).toBe('1080p')
            await userEvent.click(screen.getByRole('button', { name: /render full match/i }))
            await waitFor(() => expect(renderReel).toHaveBeenCalled())
            const opts = renderReel.mock.calls[0][2]
            expect(opts.output).toEqual({ quality: '1080p', videoBitrate: 10_000_000 })
            const original = fullMatchExport(useAppState.getState(), 'full')
            expect(opts.resumable.signature).not.toBe(original.signature)
        })

        it('should stream copy when a saved 4K choice no longer fits the footage', async () => {
            withSize(1920, 1080)
            useAppState.setState({ fullMatch: { ...useAppState.getState().fullMatch, quality: '4k' } })
            renderReel.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
            render(<FullMatchExport />)
            expect(screen.getByRole('radio', { name: /^Original/ })).toBeChecked()
            await userEvent.click(screen.getByRole('button', { name: /render full match/i }))
            await waitFor(() => expect(renderReel).toHaveBeenCalled())
            expect(renderReel.mock.calls[0][2].output).toBeUndefined()
        })

        describe('storage fit', () => {
            const stubStorage = (estimate: unknown) => Object.defineProperty(navigator, 'storage', { value: { estimate, getDirectory: async () => { throw new Error('no opfs') } }, configurable: true })
            afterEach(() => { Reflect.deleteProperty(navigator, 'storage') })
            // Footage big enough that Original (about 30 GB of it used) needs more than a 10.8 GB quota.
            const bigFootage = () => { useAppState.setState({ files: [big('GX010001.MP4', 40), big('GX020001.MP4', 40)] }); withSize(3840, 2160) }

            it('should grey out Original and select 4K when the quota is small', async () => {
                bigFootage()
                stubStorage(async () => ({ quota: 10.8e9, usage: 0 }))
                render(<FullMatchExport />)
                await waitFor(() => expect(screen.getByRole('radio', { name: /^Original/ })).toBeDisabled())
                expect(screen.getByRole('radio', { name: /^Original/ }).closest('label')).toHaveTextContent('too big')
                expect(screen.getByRole('radio', { name: /^Original/ }).closest('label')).toHaveAttribute('title', expect.stringMatching(/Too big for this browser’s storage \(about .* GB needed, 10\.8 GB available\)/))
                expect(screen.getByRole('radio', { name: /^4K/ })).toBeChecked()
                expect(screen.getByRole('note')).toHaveTextContent(/Original would not fit.*4K is selected/)
            })

            it('should block nothing when estimate() is missing', async () => {
                bigFootage()
                render(<FullMatchExport />)
                expect(screen.getByRole('radio', { name: /^Original/ })).toBeEnabled()
                expect(screen.getByRole('radio', { name: /^Original/ })).toBeChecked()
            })

            it('should block nothing when estimate() throws', async () => {
                bigFootage()
                stubStorage(async () => { throw new Error('nope') })
                render(<FullMatchExport />)
                await new Promise((r) => setTimeout(r, 20))
                expect(screen.getByRole('radio', { name: /^Original/ })).toBeEnabled()
            })

            it('should say private windows have little storage under 2 GB', async () => {
                stubStorage(async () => ({ quota: 1e9, usage: 0 }))
                render(<FullMatchExport />)
                expect(await screen.findByText(/Private windows have very little storage/)).toBeInTheDocument()
            })

            it('should not show the keep-awake note before a render runs (it lives in the render status)', async () => {
                setCoarsePointer(true)
                withSize(3840, 2160)
                useAppState.setState({ fullMatch: { ...useAppState.getState().fullMatch, quality: '1080p' } })
                render(<FullMatchExport />)
                expect(screen.queryByText('Keep the screen on, the tab open and the device plugged in.')).not.toBeInTheDocument()
            })
        })
    })
})
