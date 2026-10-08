import { describe, it, expect } from 'vitest'
import { mvhdCreationMs, topLevelBox, MAC_EPOCH_OFFSET_SEC } from './mp4Meta'

const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const tag = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))
const secs = (iso: string): number => Date.parse(iso) / 1000 + MAC_EPOCH_OFFSET_SEC

describe('mvhdCreationMs', () => {
    it('should read a version 0 creation time (seconds since 1904)', () => {
        const box = new Uint8Array([...u32(108), ...tag('mvhd'), 0, 0, 0, 0, ...u32(secs('2026-10-04T10:00:00Z')), ...u32(0), ...u32(1000), ...u32(5000)])
        expect(mvhdCreationMs(box)).toBe(Date.parse('2026-10-04T10:00:00Z'))
    })

    it('should read a version 1 (64-bit) creation time', () => {
        const s = secs('2026-10-04T10:00:00Z')
        const box = new Uint8Array([...u32(120), ...tag('mvhd'), 1, 0, 0, 0, ...u32(0), ...u32(s), ...u32(0), ...u32(0)])
        expect(mvhdCreationMs(box)).toBe(Date.parse('2026-10-04T10:00:00Z'))
    })

    it('should return undefined for a zero (unset) time, a different box, or too little data', () => {
        expect(mvhdCreationMs(new Uint8Array([...u32(108), ...tag('mvhd'), 0, 0, 0, 0, ...u32(0)]))).toBeUndefined()
        expect(mvhdCreationMs(new Uint8Array([...u32(108), ...tag('free'), 0, 0, 0, 0, ...u32(5)]))).toBeUndefined()
        expect(mvhdCreationMs(new Uint8Array([1, 2, 3]))).toBeUndefined()
    })
})

describe('topLevelBox', () => {
    it('should read type and size of a plain box header', () => {
        expect(topLevelBox(new Uint8Array([...u32(32), ...tag('moov')]), 1000)).toEqual({ type: 'moov', size: 32, header: 8 })
    })

    it('should read a 64-bit size', () => {
        expect(topLevelBox(new Uint8Array([...u32(1), ...tag('mdat'), ...u32(1), ...u32(5)]), 9)).toEqual({ type: 'mdat', size: 2 ** 32 + 5, header: 16 })
    })

    it('should treat size 0 as "to the end of the file"', () => {
        expect(topLevelBox(new Uint8Array([...u32(0), ...tag('mdat')]), 777)).toEqual({ type: 'mdat', size: 777, header: 8 })
    })

    it('should return null for a header that is too short or nonsense', () => {
        expect(topLevelBox(new Uint8Array([0, 0]), 10)).toBeNull()
        expect(topLevelBox(new Uint8Array([...u32(3), ...tag('free')]), 10)).toBeNull()
    })
})
