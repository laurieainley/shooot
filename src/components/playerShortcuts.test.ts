// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppState } from '../state'
import { runShortcut, type ShortcutPlayer } from './playerShortcuts'
import type { ZoomPan } from './useZoomPan'

function fake(over: Partial<{ time: number; duration: number; paused: boolean; rate: number }> = {}) {
    const s = { time: 100, duration: 600, paused: true, rate: 1, muted: false, fs: false, ...over }
    const p: ShortcutPlayer = {
        paused: () => s.paused, play: () => { s.paused = false }, pause: () => { s.paused = true },
        currentTime: ((t?: number) => { if (t === undefined) return s.time; s.time = t }) as ShortcutPlayer['currentTime'],
        duration: () => s.duration,
        muted: ((m?: boolean) => { if (m === undefined) return s.muted; s.muted = m }) as ShortcutPlayer['muted'],
        playbackRate: ((r?: number) => { if (r === undefined) return s.rate; s.rate = r }) as ShortcutPlayer['playbackRate'],
        isFullscreen: () => s.fs, requestFullscreen: () => { s.fs = true }, exitFullscreen: () => { s.fs = false },
    }
    return { p, s }
}
const zoom = { cycle: vi.fn(), reset: vi.fn() } as unknown as ZoomPan

describe('runShortcut', () => {
    beforeEach(() => useAppState.setState({ files: [], currentFileIndex: 0, events: [], picker: null, panel: null }))

    it('should toggle play and pause', () => {
        const { p, s } = fake()
        runShortcut('playPause', p, zoom)
        expect(s.paused).toBe(false)
        runShortcut('playPause', p, zoom)
        expect(s.paused).toBe(true)
    })
    it('should seek 5 s, or 1 s fine, inside the file', () => {
        const { p, s } = fake({ time: 3 })
        runShortcut('seekBack', p, zoom)
        expect(s.time).toBe(0)
        runShortcut('seekForwardFine', p, zoom)
        expect(s.time).toBe(1)
        runShortcut('seekForward', p, zoom)
        expect(s.time).toBe(6)
    })
    it('should step a frame and pause', () => {
        const { p, s } = fake({ paused: false })
        runShortcut('frameForward', p, zoom)
        expect(s.paused).toBe(true)
        expect(s.time).toBeGreaterThan(100)
    })
    it('should change and reset the speed within 0.25-4', () => {
        const { p, s } = fake()
        runShortcut('speedUp', p, zoom)
        expect(s.rate).toBe(1.25)
        runShortcut('speedDown', p, zoom)
        runShortcut('speedDown', p, zoom)
        expect(s.rate).toBe(0.75)
        runShortcut('speedReset', p, zoom)
        expect(s.rate).toBe(1)
    })
    it('should mute, toggle fullscreen and zoom', () => {
        const { p, s } = fake()
        runShortcut('mute', p, zoom)
        expect(s.muted).toBe(true)
        runShortcut('fullscreen', p, zoom)
        expect(s.fs).toBe(true)
        runShortcut('fullscreen', p, zoom)
        expect(s.fs).toBe(false)
        runShortcut('zoomCycle', p, zoom)
        runShortcut('zoomReset', p, zoom)
        expect(zoom.cycle).toHaveBeenCalled()
        expect(zoom.reset).toHaveBeenCalled()
    })
    it('should jump to the end and mark an event', () => {
        const { p, s } = fake()
        runShortcut('jumpEnd', p, zoom)
        expect(s.time).toBe(599)
        const before = useAppState.getState().events.length
        runShortcut('mark', p, zoom)
        expect(useAppState.getState().picker !== null || useAppState.getState().events.length > before).toBe(true)
    })
    it('should switch to the previous and next file, within the list', () => {
        const f = (n: string) => ({ id: n, file: new File([''], n), url: n, name: n, kind: 'full' as const, durationSec: 10 })
        useAppState.setState({ files: [f('a'), f('b'), f('c')], currentFileIndex: 1 })
        const { p } = fake()
        runShortcut('nextFile', p, zoom)
        expect(useAppState.getState().currentFileIndex).toBe(2)
        runShortcut('nextFile', p, zoom)
        expect(useAppState.getState().currentFileIndex).toBe(2)
        runShortcut('prevFile', p, zoom)
        runShortcut('prevFile', p, zoom)
        runShortcut('prevFile', p, zoom)
        expect(useAppState.getState().currentFileIndex).toBe(0)
    })
})
