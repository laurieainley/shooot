import { describe, it, expect, vi } from 'vitest'
import {
    RenderDiagnostics, collectEnvironment, errorInfo, describeParams, formatReport, capReport,
    saveLastReport, loadLastReport, LAST_REPORT_KEY, MAX_REPORT_BYTES, type DiagnosticsReport, type KeyValueStorage,
} from './diagnostics'
import { GOPRO4K_HVCC, X264_AVCC, hex } from './nal.fixtures'

const memory = (): KeyValueStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>()
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

describe('errorInfo', () => {
    it('should keep message and stack of an Error', () => {
        const e = new Error('boom')
        expect(errorInfo(e)).toEqual({ message: 'boom', name: 'Error', stack: e.stack })
    })
    it('should stringify non-errors', () => {
        expect(errorInfo('plain')).toEqual({ message: 'plain' })
    })
})

describe('collectEnvironment', () => {
    it('should read the navigator and WebCodecs availability', () => {
        const env = collectEnvironment({ userAgent: 'UA', platform: 'MacIntel', hardwareConcurrency: 8, deviceMemory: 8 }, { VideoEncoder: class {}, VideoDecoder: class {} })
        expect(env).toMatchObject({ userAgent: 'UA', platform: 'MacIntel', hardwareConcurrency: 8, deviceMemory: 8, webCodecs: { videoEncoder: true, videoDecoder: true, audioEncoder: false } })
    })
    it('should cope with a missing navigator', () => {
        expect(collectEnvironment(undefined, {}).webCodecs.videoEncoder).toBe(false)
    })
})

describe('describeParams', () => {
    it('should report the HEVC header level and parsed SPS of a 4K level 6.0 record', () => {
        const d = describeParams(hex(GOPRO4K_HVCC), true)
        expect(d.headerLevel).toBe(180)
        expect(d.sps).toMatchObject({ level: 180, codedWidth: 3840 })
        expect(d.bitDepthLuma).toBe(8)
        expect(d.chromaFormat).toBe(1)
    })
    it('should report the avcC level byte', () => {
        const d = describeParams(hex(X264_AVCC), false)
        expect(d.headerLevel).toBe(30)
        expect(d.headerProfile).toBe(100)
    })
    it('should not throw on garbage', () => {
        const d = describeParams(new Uint8Array([1, 2, 3]), true)
        expect(d.sps).toBeNull()
        expect(d.error).toBeTruthy()
    })
})

describe('RenderDiagnostics', () => {
    it('should record graphics outcomes with full errors, per label', () => {
        const d = new RenderDiagnostics({ kind: 'highlights', outputName: 'highlights.mp4', now: () => 1000 })
        d.graphicApplied('Title card')
        d.graphicSkipped('Goal 1', 'no encoder', new Error('nope'))
        const r = d.report('done')
        expect(r.graphics.applied).toEqual(['Title card'])
        expect(r.graphics.skipped[0]).toMatchObject({ label: 'Goal 1', reason: 'no encoder', error: { message: 'nope' } })
        expect(r.outcome).toBe('done')
        expect(r.kind).toBe('highlights')
    })
    it('should time phases and accumulate repeated ones', () => {
        let t = 0
        const d = new RenderDiagnostics({ kind: 'highlights', outputName: 'a.mp4', now: () => t })
        const end = d.begin('cuts'); t = 40; end()
        const end2 = d.begin('cuts'); t = 100; end2()
        expect(d.report('done').timingsMs.cuts).toBe(100)
    })
    it('should record encoder tries, the final config and rejections', () => {
        const d = new RenderDiagnostics({ kind: 'highlights', outputName: 'a.mp4' })
        d.encoderTry({ codec: 'hvc1.1.6.L180.B0', latencyMode: 'quality', supported: false, outcome: 'unsupported' })
        d.encoderTry({ codec: 'hvc1.1.6.L150.B0', latencyMode: 'quality', supported: true, outcome: 'ok' })
        d.rejectLastEncoder('different decoder sizes')
        d.finalEncoder({ codec: 'hvc1.1.6.L150.B0', width: 3840, height: 2160 })
        const r = d.report('done')
        expect(r.encoders).toHaveLength(2)
        expect(r.encoders[1].rejected).toBe('different decoder sizes')
        expect(r.finalEncoderConfig).toMatchObject({ width: 3840 })
    })
    it('should record the failure of a failed render', () => {
        const d = new RenderDiagnostics({ kind: 'fullMatch', outputName: 'full-match.mp4' })
        expect(d.report('failed', new Error('bad')).error?.message).toBe('bad')
    })
    it('should never throw from a collector call that gets odd input', () => {
        const d = new RenderDiagnostics({ kind: 'highlights', outputName: 'a.mp4' })
        expect(() => d.source({ index: 0, name: 'a.mp4', sizeBytes: 1, codec: 'hvc1', videoCodec: 'hevc', description: hex('00') })).not.toThrow()
    })
})

const sample = (): DiagnosticsReport => {
    const d = new RenderDiagnostics({ kind: 'highlights', outputName: 'highlights.mp4', now: () => Date.UTC(2026, 9, 7, 12, 0, 0) })
    d.source({ index: 0, name: 'GX010001.MP4', sizeBytes: 123, codec: 'hvc1.1.6.L180.B0', videoCodec: 'hevc', description: hex(GOPRO4K_HVCC), codedWidth: 3840, codedHeight: 2160, frameRate: 59.94 })
    d.graphicSkipped('Goal 1', 'the encoder changed its frame size', new Error('x'))
    return d.report('done')
}

describe('formatReport', () => {
    it('should lay out sections and end with a JSON block of the whole report', () => {
        const text = formatReport(sample())
        for (const s of ['Shooot render diagnostics', 'ENVIRONMENT', 'SOURCES', 'OUTPUT', 'GRAPHICS', 'TIMINGS', 'JSON']) expect(text).toContain(s)
        expect(text).toContain('GX010001.MP4')
        expect(text).toContain('L180')
        expect(text).toContain('Goal 1 — the encoder changed its frame size')
        const json = text.slice(text.indexOf('```json') + 7, text.lastIndexOf('```'))
        expect(JSON.parse(json).graphics.skipped[0].label).toBe('Goal 1')
    })
})

describe('capReport', () => {
    it('should leave a small report alone', () => {
        const r = sample()
        expect(capReport(r, 200_000)).toEqual(r)
    })
    it('should drop stacks, then trim lists, to fit the cap', () => {
        const r = sample()
        r.graphics.skipped = Array.from({ length: 400 }, (_, i) => ({ label: `g${i}`, reason: 'r', error: { message: 'm', stack: 's'.repeat(2000) } }))
        const capped = capReport(r, 50_000)
        expect(JSON.stringify(capped).length).toBeLessThanOrEqual(50_000)
        expect(capped.graphics.skipped.length).toBeGreaterThan(0)
    })
})

describe('last report storage', () => {
    it('should round-trip a report', () => {
        const s = memory()
        const r = sample()
        saveLastReport(r, s)
        expect(loadLastReport(s)).toEqual(r)
        expect(s.data.get(LAST_REPORT_KEY)!.length).toBeLessThanOrEqual(MAX_REPORT_BYTES)
    })
    it('should return null for empty, corrupt or foreign data', () => {
        const s = memory()
        expect(loadLastReport(s)).toBeNull()
        s.setItem(LAST_REPORT_KEY, '{nope')
        expect(loadLastReport(s)).toBeNull()
        s.setItem(LAST_REPORT_KEY, '{"a":1}')
        expect(loadLastReport(s)).toBeNull()
    })
    it('should not throw when storage fails', () => {
        const bad: KeyValueStorage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('full') } }
        expect(() => saveLastReport(sample(), bad)).not.toThrow()
        expect(loadLastReport(bad)).toBeNull()
    })
})

describe('publish', () => {
    it('should log a collapsed group, save the report and call back', async () => {
        const { publishReport } = await import('./diagnostics')
        const s = memory()
        const con = { groupCollapsed: vi.fn(), log: vi.fn(), groupEnd: vi.fn() }
        const cb = vi.fn()
        publishReport(sample(), { storage: s, console: con, onReport: cb })
        expect(con.groupCollapsed).toHaveBeenCalledWith('[shooot] render diagnostics')
        expect(con.log).toHaveBeenCalled()
        expect(con.groupEnd).toHaveBeenCalled()
        expect(cb).toHaveBeenCalled()
        expect(loadLastReport(s)).not.toBeNull()
    })
})
