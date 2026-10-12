import { describe, expect, it } from 'vitest'
import { formatResult, summaryText, type StageResult } from './results'

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
})
