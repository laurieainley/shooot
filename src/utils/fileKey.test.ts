import { describe, it, expect } from 'vitest'
import { fileKey, fileKeys } from './fileKey'

describe('fileKey', () => {
    it('should use the file name', () => {
        expect(fileKey('match-1.mp4')).toBe('match-1.mp4')
    })
})

describe('fileKey (GoPro)', () => {
    it('should give an LRV proxy and its full MP4 the same key', () => {
        expect(fileKey('GL010226.LRV')).toBe(fileKey('GX010226.MP4'))
    })

    it('should keep chapters of one recording apart', () => {
        expect(fileKey('GX010226.MP4')).not.toBe(fileKey('GX020226.MP4'))
    })
})

describe('fileKeys', () => {
    const f = (name: string, size = 100) => ({ name, file: { size } })

    it('should use the plain key for names that are unique', () => {
        expect(fileKeys([f('IMG_0001.MOV'), f('IMG_0002.MOV')])).toEqual(['IMG_0001.MOV', 'IMG_0002.MOV'])
    })

    it('should tell apart files of the same name (two phones) by size', () => {
        expect(fileKeys([f('IMG_0001.MOV', 100), f('IMG_0001.MOV', 250)])).toEqual(['IMG_0001.MOV@100', 'IMG_0001.MOV@250'])
    })

    it('should tell identical names and sizes apart by position', () => {
        expect(fileKeys([f('a.mp4', 5), f('a.mp4', 5)])).toEqual(['a.mp4@5', 'a.mp4@5#2'])
    })

    it('should give a GoPro proxy and its full file one key and still not clash with other names', () => {
        expect(fileKeys([f('GL010226.LRV'), f('x.mp4')])).toEqual([fileKey('GX010226.MP4'), 'x.mp4'])
    })

    it('should cope with entries that have no file (name-only)', () => {
        expect(fileKeys([{ name: 'a.mp4' }, { name: 'a.mp4' }])).toEqual(['a.mp4', 'a.mp4#2'])
    })
})
