// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', async () => (await import('./files/idbMock')).idbMock())

import { MAX_RECORDS, appendRecord, buildExportRecord, clearRecords, deliverLog, estimateWithoutPreparing, loadLogDownload, readRecords, toJsonl, type ExportRecord, type PrepareRecord } from './exportLog'
import type { PipelineStats } from './render/experiments'

const stats = (p: Partial<PipelineStats> = {}): PipelineStats => ({ frames: 0, units: 0, decodeWaitMs: 0, paintMs: 0, encodeCallMs: 0, backpressureMs: 0, drainMs: 0, unitSpans: [], ...p })
const prepRec = (n: number): PrepareRecord => ({ v: 1, type: 'prepare', at: `t${n}`, project: 'M', kind: 'fullMatch', quality: '4k', outcome: 'ready', device: 'desktop', wallSec: n, unitsEncoded: 1, encodedSec: 10, unitsReady: 1, unitsTotal: 1, pausedSec: 0, throttledSec: 0 })

describe('estimateWithoutPreparing', () => {
    it('should scale the encode rate of the units that were encoded to all of them', () => {
        // 100 s of units encoded in 200 s of summed unit time on 2 lanes = 100 s wall: 1 output s per wall s; the match has 1000 s in all.
        expect(estimateWithoutPreparing(stats({ encodedSec: 100, reusedSec: 900, encodedUnitMs: 200_000, parallel: 2 }))).toBe(1000)
    })
    it('should be unknown when nothing was encoded or the numbers are missing', () => {
        expect(estimateWithoutPreparing(stats({ encodedSec: 0, reusedSec: 1000, encodedUnitMs: 0, parallel: 2 }))).toBeNull()
        expect(estimateWithoutPreparing(null)).toBeNull()
        expect(estimateWithoutPreparing(stats())).toBeNull()
    })
})

describe('buildExportRecord', () => {
    const base = { now: new Date('2026-11-05T18:00:00Z'), project: 'Whites v Colours', kind: 'fullMatch' as const, quality: '4k' as const, outputSec: 6600.04, device: 'desktop', save: 'download' as const, withoutPrepared: false, model: { low: 5000.4, high: 7000.6 }, prepare: null }
    it('should carry the wall and encode times, what was reused, the estimates and only the cache notes', () => {
        const r = buildExportRecord({
            ...base,
            end: { outcome: 'done', wallMs: 184_000, notes: ['Re-encode 4k: 3840x2160', 'Unit cache: 640 of 660 parts can be reused (prepared earlier or from the last export)', 'Blocks of 300 frames (10.01 s) on the source frame grid: 660 units'], error: undefined,
                stats: stats({ reused: { units: 640, of: 660 }, unitsTotal: 662, reusedSec: 6400, encodedSec: 200, encodeWallMs: 170_000, encodedUnitMs: 400_000, restoredUnitMs: 30_000, parallel: 2 }) },
            prepare: { wallSec: 3000, unitsEncoded: 600, encodedSec: 6000, pausedSec: 20, throttledSec: 90 },
        })
        expect(r).toMatchObject({
            type: 'export', kind: 'fullMatch', quality: '4k', outcome: 'done', wallSec: 184, encodeSec: 170, unitsReused: 640, unitsTotal: 662, reusedSec: 6400, encodedSec: 200,
            estimatedWithoutPreparingSec: 6600, modelFullReencodeSec: { low: 5000, high: 7001 }, parallel: 2, withoutPrepared: false, outputSec: 6600,
            prepare: { wallSec: 3000, unitsEncoded: 600, pausedSec: 20, throttledSec: 90 },
        })
        expect(r.notes).toHaveLength(2)
    })
    it('should log a stream copy or a failure without engine numbers', () => {
        const r = buildExportRecord({ ...base, quality: 'original', model: null, end: { outcome: 'failed', wallMs: 5000, stats: null, notes: [], error: 'boom' } })
        expect(r).toMatchObject({ outcome: 'failed', encodeSec: null, unitsReused: null, estimatedWithoutPreparingSec: null, modelFullReencodeSec: null, error: 'boom' })
    })
    it('should flag the baseline run', () => {
        expect(buildExportRecord({ ...base, withoutPrepared: true, end: { outcome: 'done', wallMs: 1000, stats: null, notes: [] } }).withoutPrepared).toBe(true)
    })
})

describe('the stored log', () => {
    beforeEach(async () => { await clearRecords() })
    it('should keep records in order and drop the oldest past the cap', async () => {
        for (let i = 0; i < 3; i++) void appendRecord(prepRec(i))
        expect((await readRecords()).map((r) => r.at)).toEqual(['t0', 't1', 't2'])
        expect(MAX_RECORDS).toBeGreaterThan(100)
    })
    it('should write one JSON object per line behind a header', async () => {
        await appendRecord(prepRec(1))
        const d = await loadLogDownload({ userAgent: 'UA' })
        const lines = d.text.trimEnd().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>)
        expect(lines[0]).toMatchObject({ type: 'header', app: 'shooot', records: 1, userAgent: 'UA' })
        expect(lines[1]).toMatchObject({ type: 'prepare', at: 't1' })
        expect(toJsonl([], { app: 'shooot', exportedAt: 'x', userAgent: '' }).split('\n')).toHaveLength(2)
    })
})

describe('deliverLog', () => {
    beforeEach(async () => { await clearRecords() })
    it('should say when there is nothing to hand over', async () => {
        expect(await deliverLog(await loadLogDownload({}))).toBe('empty')
    })
    it('should download through a link on a desktop browser', async () => {
        await appendRecord(prepRec(1))
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
        URL.createObjectURL = vi.fn(() => 'blob:x')
        URL.revokeObjectURL = vi.fn()
        const d = await loadLogDownload({ userAgent: 'Chrome' })
        expect(await deliverLog(d, { userAgent: 'Chrome', maxTouchPoints: 0 })).toBe('downloaded')
        expect(click).toHaveBeenCalled()
        click.mockRestore()
    })
    it('should open the share sheet on a touch device that can share files, and fall back to the download when it refuses', async () => {
        await appendRecord(prepRec(1))
        const d = await loadLogDownload({ userAgent: 'iPad' })
        const share = vi.fn(async () => undefined)
        expect(await deliverLog(d, { userAgent: 'iPad', maxTouchPoints: 5, canShare: () => true, share })).toBe('shared')
        expect(share).toHaveBeenCalledTimes(1)
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
        URL.createObjectURL = vi.fn(() => 'blob:x')
        URL.revokeObjectURL = vi.fn()
        const refuse = vi.fn(async () => { throw new TypeError('not allowed') })
        expect(await deliverLog(d, { userAgent: 'iPad', maxTouchPoints: 5, canShare: () => true, share: refuse })).toBe('downloaded')
        const cancel = vi.fn(async () => { throw new DOMException('closed', 'AbortError') })
        expect(await deliverLog(d, { userAgent: 'iPad', maxTouchPoints: 5, canShare: () => true, share: cancel })).toBe('shared')
        click.mockRestore()
    })
})

export type { ExportRecord }
