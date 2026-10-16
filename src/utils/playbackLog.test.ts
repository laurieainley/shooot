import { describe, expect, it, vi } from 'vitest'
import { createPlaybackLog, createStuckDetector, formatPlaybackReport, PLAYBACK_LOG_KEY, readStoredPlaybackLog, summariseRanges } from './playbackLog'

describe('playback log', () => {
    it('summarises buffered ranges', () => {
        expect(summariseRanges([])).toBe('none')
        expect(summariseRanges([[0, 12.34], [40, 51]])).toBe('0–12.3, 40–51')
    })
    it('keeps only the newest entries', () => {
        let t = 0
        const log = createPlaybackLog({ now: () => ++t, capacity: 3 })
        for (let i = 0; i < 5; i++) log.add({ type: 'event', name: `e${i}` })
        expect(log.entries().map((e) => e.name)).toEqual(['e2', 'e3', 'e4'])
    })
    it('persists at most once every 2 s, with a trailing write', () => {
        let now = 10_000
        const set = vi.fn()
        const timers: (() => void)[] = []
        const log = createPlaybackLog({ now: () => now, storage: { getItem: () => null, setItem: set, removeItem: () => {} }, schedule: (fn) => { timers.push(fn) } })
        log.add({ type: 'event', name: 'a' })
        expect(set).toHaveBeenCalledTimes(1)
        now += 500
        log.add({ type: 'event', name: 'b' })
        log.add({ type: 'event', name: 'c' })
        expect(set).toHaveBeenCalledTimes(1)
        expect(timers).toHaveLength(1)
        now += 1500
        timers[0]()
        expect(set).toHaveBeenCalledTimes(2)
        const saved = JSON.parse(set.mock.calls[1][1])
        expect(saved.entries.map((e: { name: string }) => e.name)).toEqual(['a', 'b', 'c'])
        expect(set.mock.calls[1][0]).toBe(PLAYBACK_LOG_KEY)
    })
    it('reads back what was stored and rejects junk', () => {
        const store = new Map<string, string>()
        const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: () => {} }
        expect(readStoredPlaybackLog(s)).toBeNull()
        store.set(PLAYBACK_LOG_KEY, 'junk')
        expect(readStoredPlaybackLog(s)).toBeNull()
        const log = createPlaybackLog({ now: () => 1, storage: s })
        log.add({ type: 'event', name: 'play' })
        expect(readStoredPlaybackLog(s)?.entries[0].name).toBe('play')
    })
    it('formats environment, sources and events', () => {
        const text = formatPlaybackReport({
            sources: [{ at: 0, name: 'GX01.MP4', sizeBytes: 4 * 1073741824, kind: 'full', codec: 'hevc' }],
            entries: [
                { t: 0, type: 'event', name: 'waiting', currentTime: 2.5, readyState: 2, networkState: 2, buffered: '0–2.5' },
                { t: 1, type: 'stuck', name: 'STUCK waiting (no playing for 10 s)', currentTime: 2.5, readyState: 2, networkState: 2, buffered: '0–2.5' },
                { t: 2, type: 'event', name: 'error', detail: 'MediaError code 4', currentTime: 0, readyState: 0, networkState: 3, buffered: 'none' },
                { t: 3, type: 'note', name: 'jump', detail: 'file 1 @ 3.0 s' },
            ],
        }, { userAgent: 'UA', platform: 'iPad', deviceMemory: 4, hardwareConcurrency: 8, mse: false, managedMse: true })
        expect(text).toContain('User agent: UA')
        expect(text).toContain('MediaSource: NO   ManagedMediaSource: yes')
        expect(text).toContain('GX01.MP4 (4.00 GB), full, hevc')
        expect(text).toContain('waiting  t=2.50 rs=2 ns=2 buf=[0–2.5]')
        expect(text).toContain('!! STUCK waiting')
        expect(text).toContain('error (MediaError code 4)')
        expect(text).toContain('note: jump (file 1 @ 3.0 s)')
    })
})

describe('stuck detector', () => {
    it('reports waiting with no playing, and seeking with no seeked, after 10 s', () => {
        vi.useFakeTimers()
        const onStuck = vi.fn()
        const d = createStuckDetector({ onStuck })
        d.event('waiting'); d.event('seeking')
        vi.advanceTimersByTime(9999)
        expect(onStuck).not.toHaveBeenCalled()
        vi.advanceTimersByTime(2)
        expect(onStuck.mock.calls.map((c) => c[0]).sort()).toEqual(['seeking', 'waiting'])
        vi.useRealTimers()
    })
    it('stays quiet when playing / seeked arrive in time', () => {
        vi.useFakeTimers()
        const onStuck = vi.fn()
        const d = createStuckDetector({ onStuck })
        d.event('waiting'); d.event('seeking')
        vi.advanceTimersByTime(5000)
        d.event('playing'); d.event('seeked')
        vi.advanceTimersByTime(20_000)
        expect(onStuck).not.toHaveBeenCalled()
        vi.useRealTimers()
    })
})
