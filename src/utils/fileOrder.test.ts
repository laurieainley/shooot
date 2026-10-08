import { describe, it, expect } from 'vitest'
import { naturalCompare, orderEntries } from './fileOrder'
import { pairFiles } from './gopro'

type F = { name: string; timeMs?: number }
const order = (files: F[]): string[] =>
    orderEntries(pairFiles(files), (f) => f).map((e) => (e.full ?? e.proxy)!.name)

describe('naturalCompare', () => {
    it('should order numbers inside names numerically', () => {
        expect(['IMG_10.MOV', 'IMG_9.MOV', 'IMG_100.MOV'].sort(naturalCompare)).toEqual(['IMG_9.MOV', 'IMG_10.MOV', 'IMG_100.MOV'])
    })
})

describe('orderEntries', () => {
    it('should keep GoPro chapter order for GoPro names', () => {
        expect(order([{ name: 'GX020226.MP4' }, { name: 'GX010227.MP4' }, { name: 'GX010226.MP4' }])).toEqual(['GX010226.MP4', 'GX020226.MP4', 'GX010227.MP4'])
    })

    it('should order other files by recording time', () => {
        expect(order([{ name: 'a.mp4', timeMs: 300 }, { name: 'b.mp4', timeMs: 100 }, { name: 'c.mp4', timeMs: 200 }])).toEqual(['b.mp4', 'c.mp4', 'a.mp4'])
    })

    it('should fall back to natural name order when there is no time at all', () => {
        expect(order([{ name: 'clip10.mp4' }, { name: 'clip2.mp4' }, { name: 'clip1.mp4' }])).toEqual(['clip1.mp4', 'clip2.mp4', 'clip10.mp4'])
    })

    it('should order by name when times are equal', () => {
        expect(order([{ name: 'b.mp4', timeMs: 5 }, { name: 'a.mp4', timeMs: 5 }])).toEqual(['a.mp4', 'b.mp4'])
    })

    it('should put files without a time after those with one', () => {
        expect(order([{ name: 'a.mp4' }, { name: 'z.mp4', timeMs: 1 }])).toEqual(['z.mp4', 'a.mp4'])
    })

    it('should merge GoPro and other files by time when every file has one', () => {
        const out = order([
            { name: 'GX010226.MP4', timeMs: 200 }, { name: 'GX020226.MP4', timeMs: 260 },
            { name: 'early.mp4', timeMs: 100 }, { name: 'late.mp4', timeMs: 900 },
        ])
        expect(out).toEqual(['early.mp4', 'GX010226.MP4', 'GX020226.MP4', 'late.mp4'])
    })

    it('should put GoPro files first when times are missing', () => {
        expect(order([{ name: 'phone.mp4' }, { name: 'GX010226.MP4' }])).toEqual(['GX010226.MP4', 'phone.mp4'])
    })

    it('should use the proxy time when only a proxy is loaded', () => {
        expect(order([{ name: 'GL010226.LRV', timeMs: 500 }, { name: 'a.mp4', timeMs: 100 }])).toEqual(['a.mp4', 'GL010226.LRV'])
    })
})
