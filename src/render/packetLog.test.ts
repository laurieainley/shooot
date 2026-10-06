import { describe, it, expect } from 'vitest'
import { LogParser, encodeRecord, type LogRecord } from './packetLog'

const rec = (track: 0 | 1, key: boolean, ts: number, dur: number, bytes: number[]): LogRecord =>
    ({ track, key, timestamp: ts, duration: dur, data: new Uint8Array(bytes) })

describe('packet log', () => {
    const records = [rec(0, true, 0, 1 / 30, [1, 2, 3]), rec(1, true, 0.0213, 0.0213, [9]), rec(0, false, 1 / 30, 1 / 30, Array.from({ length: 300 }, (_, i) => i % 256))]
    const bytes = (): Uint8Array => {
        const parts = records.map((r) => encodeRecord(r))
        const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
        let o = 0
        for (const p of parts) { out.set(p, o); o += p.length }
        return out
    }

    it('should round-trip records with exact timestamps', () => {
        const parsed = new LogParser().push(bytes())
        expect(parsed).toEqual(records)
    })

    it('should parse records split across chunks at any byte', () => {
        const all = bytes()
        for (const cut of [1, 7, 23, 24, 27, 40, all.length - 1]) {
            const p = new LogParser()
            const out = [...p.push(all.slice(0, cut)), ...p.push(all.slice(cut))]
            expect(out).toEqual(records)
            expect(p.pending).toBe(0)
        }
    })

    it('should report leftover bytes of a torn record', () => {
        const p = new LogParser()
        p.push(bytes().slice(0, 30))
        expect(p.pending).toBeGreaterThan(0)
    })
})
