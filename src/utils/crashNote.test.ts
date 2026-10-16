import { describe, expect, it } from 'vitest'
import { BREADCRUMB_KEY, CLEAN_EXIT_KEY, consumeCrash, createTracker, crashReportText, describeCrash, markCleanExit, RECENT_MS, type StorageLike } from './crashNote'

const mem = (): StorageLike & { map: Map<string, string> } => {
    const map = new Map<string, string>()
    return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v) }, removeItem: (k) => { map.delete(k) } }
}
const T = new Date(2026, 0, 1, 10, 42, 0).getTime()
const file = { name: 'GX010123.MP4', sizeBytes: 4 * 1073741824 }

function crashed(now = T) {
    const s = mem()
    const tr = createTracker({ storage: s, now: () => now, deviceMemory: () => 4, memory: () => ({ usedJSHeapSize: 2e8 }) })
    tr.start('find-goals', { kind: 'find-goals', files: [file] })
    tr.start('playback', { kind: 'playback', files: [file] }, () => ({ currentTime: 12.5 }))
    tr.beat()
    return s
}

describe('crash note', () => {
    it('detects a crash: breadcrumb, no clean exit, recent heartbeat', () => {
        const note = consumeCrash(crashed(), T + 5000)
        expect(note?.primary.kind).toBe('find-goals')
        expect(note?.others.map((o) => o.kind)).toEqual(['playback'])
        expect(note?.breadcrumb.deviceMemory).toBe(4)
        expect(note?.breadcrumb.activities.playback.currentTime).toBe(12.5)
        expect(describeCrash(note!)).toBe('The page reloaded by itself during Find goals at 10:42 (playing GX010123.MP4, 4.0 GB). This usually means the browser ran out of memory.')
    })
    it('a clean exit (pagehide or intentional reload) is not a crash', () => {
        const s = crashed()
        markCleanExit(s)
        expect(consumeCrash(s, T + 1000)).toBeNull()
    })
    it('a stale heartbeat is not blamed', () => {
        expect(consumeCrash(crashed(), T + RECENT_MS + 1)).toBeNull()
    })
    it('consumes the state, so the note shows once', () => {
        const s = crashed()
        expect(consumeCrash(s, T + 1)).not.toBeNull()
        expect(s.map.has(BREADCRUMB_KEY)).toBe(false)
        expect(consumeCrash(s, T + 2)).toBeNull()
    })
    it('ending the last activity normally clears the breadcrumb', () => {
        const s = mem()
        const tr = createTracker({ storage: s, now: () => T })
        tr.start('render', { kind: 'render', label: 'reel', files: [] })
        expect(tr.active()).toBe(true)
        tr.end('render')
        expect(tr.active()).toBe(false)
        expect(consumeCrash(s, T + 1)).toBeNull()
    })
    it('starting an activity clears an earlier clean-exit flag (e.g. restored from the back/forward cache)', () => {
        const s = mem()
        markCleanExit(s)
        createTracker({ storage: s, now: () => T }).start('render', { kind: 'render', files: [] })
        expect(s.map.has(CLEAN_EXIT_KEY)).toBe(false)
        expect(consumeCrash(s, T + 1)).not.toBeNull()
    })
    it('ignores garbage and broken storage', () => {
        const s = mem()
        s.setItem(BREADCRUMB_KEY, '{nope')
        expect(consumeCrash(s, T)).toBeNull()
        const bad: StorageLike = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
        expect(consumeCrash(bad, T)).toBeNull()
        expect(() => createTracker({ storage: bad, now: () => T }).start('a', { kind: 'render', files: [] })).not.toThrow()
    })
    it('names playback when it is the only activity, and the report carries details and extra text', () => {
        const s = mem()
        createTracker({ storage: s, now: () => T }).start('playback', { kind: 'playback', files: [file] })
        const note = consumeCrash(s, T + 1)!
        expect(describeCrash(note)).toContain('during video playback at 10:42 (GX010123.MP4, 4.0 GB)')
        const text = crashReportText(note, { userAgent: 'UA', platform: 'iPad' }, 'PLAYBACK LOG')
        expect(text).toContain('User agent: UA')
        expect(text).toContain('GX010123.MP4')
        expect(text.endsWith('PLAYBACK LOG')).toBe(true)
    })
})
