import { describe, it, expect } from 'vitest'
import { relinkEvents, linkedEvents } from './relink'
import type { MatchEvent } from '../types'

const files = (...names: string[]) => names.map((name) => ({ name }))
const ev = (id: string, extra: Partial<MatchEvent>): MatchEvent => ({ id, matchTimeSec: 10, type: 'goal', ...extra })

describe('relinkEvents', () => {
    it('should assign a key from the current index when the event has none', () => {
        const r = relinkEvents([ev('a', { sourceFileIndex: 1 })], files('one.mp4', 'two.mp4'))
        expect(r[0]).toMatchObject({ sourceFileIndex: 1, sourceFileKey: 'two.mp4' })
    })

    it('should treat a missing index as file 0 for legacy events', () => {
        const r = relinkEvents([ev('a', {})], files('one.mp4'))
        expect(r[0].sourceFileKey).toBe('one.mp4')
    })

    it('should leave keyless events alone when their file does not exist', () => {
        const e = ev('a', { sourceFileIndex: 3 })
        expect(relinkEvents([e], files('one.mp4'))[0]).toBe(e)
    })

    it('should follow the file when files are reordered', () => {
        const r = relinkEvents([ev('a', { sourceFileIndex: 0, sourceFileKey: 'one.mp4' })], files('two.mp4', 'one.mp4'))
        expect(r[0].sourceFileIndex).toBe(1)
    })

    it('should mark events unlinked when their file is removed, keeping the old index', () => {
        const r = relinkEvents([ev('a', { sourceFileIndex: 0, sourceFileKey: 'gone.mp4' })], files('one.mp4'))
        expect(r[0]).toMatchObject({ unlinked: true, sourceFileIndex: 0 })
    })

    it('should relink and clear unlinked when the file is added back', () => {
        const r = relinkEvents([ev('a', { sourceFileIndex: 0, sourceFileKey: 'back.mp4', unlinked: true })], files('one.mp4', 'back.mp4'))
        expect(r[0].sourceFileIndex).toBe(1)
        expect(r[0].unlinked).toBeUndefined()
    })

    it('should return the same object when nothing changes', () => {
        const e = ev('a', { sourceFileIndex: 0, sourceFileKey: 'one.mp4' })
        expect(relinkEvents([e], files('one.mp4'))[0]).toBe(e)
    })
})

describe('linkedEvents', () => {
    it('should drop unlinked events', () => {
        const r = linkedEvents([ev('a', {}), ev('b', { unlinked: true })])
        expect(r.map((e) => e.id)).toEqual(['a'])
    })
})
