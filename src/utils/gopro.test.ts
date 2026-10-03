import { describe, it, expect } from 'vitest'
import { pairFiles, parseGoProName } from './gopro'

describe('parseGoProName', () => {
    it('should parse an HEVC full file', () => {
        expect(parseGoProName('GX010226.MP4')).toEqual({ key: '010226', chapter: 1, kind: 'full' })
    })

    it('should parse an H.264 full file', () => {
        expect(parseGoProName('GH030012.MP4')).toEqual({ key: '030012', chapter: 3, kind: 'full' })
    })

    it('should parse an LRV proxy', () => {
        expect(parseGoProName('GL010226.LRV')).toEqual({ key: '010226', chapter: 1, kind: 'proxy' })
    })

    it('should be case-insensitive', () => {
        expect(parseGoProName('gl020238.lrv')).toEqual({ key: '020238', chapter: 2, kind: 'proxy' })
    })

    it('should return null for non-GoPro names', () => {
        expect(parseGoProName('match.mp4')).toBeNull()
        expect(parseGoProName('GX010226.THM')).toBeNull()
        expect(parseGoProName('GL010226.MP4')).toBeNull()
    })
})

const n = (name: string) => ({ name })

describe('pairFiles', () => {
    it('should pair a proxy with its full file', () => {
        const r = pairFiles([n('GX010226.MP4'), n('GL010226.LRV')])
        expect(r).toEqual([{ key: '010226', proxy: n('GL010226.LRV'), full: n('GX010226.MP4') }])
    })

    it('should keep orphan proxies and orphan full files', () => {
        const r = pairFiles([n('GL010001.LRV'), n('GX010002.MP4')])
        expect(r).toEqual([
            { key: '010001', proxy: n('GL010001.LRV'), full: undefined },
            { key: '010002', proxy: undefined, full: n('GX010002.MP4') },
        ])
    })

    it('should order by recording number then chapter', () => {
        const r = pairFiles([n('GX020238.MP4'), n('GX010240.MP4'), n('GX010238.MP4')])
        expect(r.map((e) => e.key)).toEqual(['010238', '020238', '010240'])
    })

    it('should pass non-GoPro files through as full, after GoPro files, in input order', () => {
        const r = pairFiles([n('b.mp4'), n('GX010001.MP4'), n('a.mp4')])
        expect(r.map((e) => e.full?.name)).toEqual(['GX010001.MP4', 'b.mp4', 'a.mp4'])
        expect(r[1]).toEqual({ key: null, proxy: undefined, full: n('b.mp4') })
    })
})
