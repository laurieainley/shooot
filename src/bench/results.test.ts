import { describe, expect, it } from 'vitest'
import { experimentRows, formatResult, speedupPct, summaryText, type ExperimentResult, type StageResult } from './results'

const ok: StageResult = { stage: 'reencode1080', label: 'Re-encode to 1080p', source: 'a.mp4', status: 'ok', wallMs: 41200, timesRealtime: 0.4, fps: 74.3, outputBytes: 70 * 1048576, peakHeapMB: 160 }

describe('bench results', () => {
    it('should summarise time, speed, fps, size and heap on one line', () => {
        expect(formatResult(ok)).toBe('Re-encode to 1080p [a.mp4]: 41.2 s, 0.40x realtime, 74.3 fps, 70 MB, heap 160 MB')
    })
    it('should say why a stage was skipped and show a failure message', () => {
        expect(formatResult({ ...ok, status: 'skipped', reason: 'source is 1920x1080, not 4K' })).toContain('skipped (source is 1920x1080, not 4K)')
        expect(formatResult({ ...ok, status: 'failed', error: { message: 'boom' } })).toContain('FAILED boom')
    })
    it('should lead the shared text with the browser and list every stage', () => {
        const text = summaryText({ startedAt: 't', page: 'p', device: { userAgent: 'UA/1' }, results: [ok, { ...ok, status: 'skipped', reason: 'x' }] })
        expect(text.split('\n')).toHaveLength(4)
        expect(text).toContain('UA/1')
    })

    describe('experiments', () => {
        const exp: ExperimentResult = {
            id: 'latency', number: 7, name: 'Realtime encoder', source: 'a.mp4', excerptSec: 10, status: 'ok',
            rows: [{ label: '1080p', baselineName: 'quality', variantName: 'realtime', baselineMs: 10000, variantMs: 8000, speedupPct: 20, baselineBytes: 20 * 1048576, variantBytes: 25 * 1048576 }],
        }
        it('should compute the speed-up as the time saved over the baseline', () => {
            expect(speedupPct(10000, 8000)).toBeCloseTo(20)
            expect(speedupPct(10000, 12000)).toBeCloseTo(-20)
            expect(speedupPct(undefined, 1)).toBeUndefined()
        })
        it('should list one table row per measurement, and one for a failed or skipped experiment', () => {
            const rows = experimentRows([exp, { ...exp, id: 'directSave', number: 4, name: 'Direct save', status: 'skipped', reason: 'not supported', rows: [] }, { ...exp, number: 9, name: 'Boom', status: 'failed', rows: [], error: { message: 'boom' } }])
            expect(rows).toHaveLength(3)
            expect(rows[0]).toEqual(['#7 Realtime encoder: 1080p', 'quality 10.0 s', 'realtime 8.0 s', '+20%', '20 MB / 25 MB', ''])
            expect(rows[1][5]).toBe('skipped: not supported')
            expect(rows[2][5]).toBe('boom')
        })
        it('should carry the experiment table in the shared text', () => {
            const text = summaryText({ startedAt: 't', page: 'p', device: {}, results: [], experiments: [exp] })
            expect(text).toContain('#7 Realtime encoder: 1080p | quality 10.0 s | realtime 8.0 s | +20%')
        })
    })
})
