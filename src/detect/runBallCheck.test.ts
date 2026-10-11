import { describe, expect, it, vi } from 'vitest'
import { runBallCheck, type BallDetectorLike, type FrameSourceLike } from './runBallCheck'
import type { GoalMarks, Suggestion } from '../types'

// A far-style goal: posts at x 0.4/0.6, y 0.5 (bottom), bars at 0.4 (top). 1000x1000 frame.
const marks: GoalMarks = { postL: { x: 0.4, y: 0.5 }, postR: { x: 0.6, y: 0.5 }, barL: { x: 0.4, y: 0.4 }, barR: { x: 0.6, y: 0.4 } }
const sug = (id: string, t: number): Suggestion => ({ id, globalTimeSec: t, score: 1, source: 'audio', status: 'pending' })
const img = (): ImageData => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) as unknown as ImageData

function fakeFrames(log: { file: string; times: number[] }[], dispose = vi.fn()): (f: File) => Promise<FrameSourceLike> {
    return async (file) => ({
        frameSize: { w: 1000, h: 1000 },
        async *tilesAt(times, tiles) { log.push({ file: file.name, times: [...times] }); for (const t of times) yield { timeSec: t, images: tiles.map(img) } },
        dispose,
    })
}
// Always reports a ball (tile centre -> inside the goal mouth) so each frame counts.
const ballEverywhere = (): BallDetectorLike => ({
    ready: Promise.resolve({ ep: 'wasm' }),
    detect: async (tiles) => tiles.map(() => [{ x1: 180, y1: 200, x2: 200, y2: 220, score: 0.9 }]),
    dispose: vi.fn(),
})
const noBall = (): BallDetectorLike => ({ ready: Promise.resolve({ ep: 'wasm' }), detect: async (tiles) => tiles.map(() => []), dispose: vi.fn() })
const files = [{ file: new File([], 'A'), durationSec: 100, offsetSec: 0 }, { file: new File([], 'B'), durationSec: 100, offsetSec: 100 }]

describe('runBallCheck', () => {
    it('should give a verdict per suggestion straight away, with progress', async () => {
        const log: { file: string; times: number[] }[] = []
        const verdicts: [string, unknown][] = []
        const progress: number[] = []
        // Moving ball: static filter ignores a box that never moves, so vary the box by call.
        let n = 0
        const detector: BallDetectorLike = { ready: Promise.resolve({ ep: 'wasm' }), detect: async (tiles) => tiles.map(() => [{ x1: 150 + (n++) * 20, y1: 190, x2: 170 + n * 20, y2: 210, score: 0.9 }]), dispose: vi.fn() }
        await runBallCheck({ suggestions: [sug('a', 50), sug('b', 80)], marks: { team1: marks }, files, totalSec: 200 },
            { frames: fakeFrames(log), detector: () => detector }, new AbortController().signal, (f) => progress.push(f), (id, b) => verdicts.push([id, b]))
        expect(verdicts.map((v) => v[0])).toEqual(['a', 'b'])
        expect(verdicts[0][1]).toMatchObject({ goal: 'team1' })
        expect(progress).toEqual([0.5, 1])
        expect(log[0].times).toHaveLength(13)
    })
    it('should return null when no ball is seen', async () => {
        const verdicts: unknown[] = []
        await runBallCheck({ suggestions: [sug('a', 50)], marks: { team1: marks }, files, totalSec: 200 },
            { frames: fakeFrames([]), detector: noBall }, new AbortController().signal, () => {}, (_id, b) => verdicts.push(b))
        expect(verdicts).toEqual([null])
    })
    it('should use both files for a window that crosses a file boundary', async () => {
        const log: { file: string; times: number[] }[] = []
        await runBallCheck({ suggestions: [sug('a', 101)], marks: { team1: marks }, files, totalSec: 200 },
            { frames: fakeFrames(log), detector: noBall }, new AbortController().signal, () => {}, () => {})
        const a = log.find((l) => l.file === 'A')!, b = log.find((l) => l.file === 'B')!
        expect(a.times.every((t) => t < 100)).toBe(true)
        expect(b.times[0]).toBeCloseTo(0.0, 5) // 98 + 2 s => file B starts at 100 -> 0
        expect(a.times.length + b.times.length).toBe(13)
        expect(b.times.every((t) => t >= 0 && t <= 5)).toBe(true)
    })
    it('should only make tiles for the goal that is marked', async () => {
        let tileCounts: number[] = []
        const frames = async (): Promise<FrameSourceLike> => ({
            frameSize: { w: 1000, h: 1000 },
            async *tilesAt(times, tiles) { tileCounts.push(tiles.length); for (const t of times.slice(0, 1)) yield { timeSec: t, images: tiles.map(img) } },
            dispose: () => {},
        })
        await runBallCheck({ suggestions: [sug('a', 50)], marks: { team2: marks }, files, totalSec: 200 },
            { frames, detector: noBall }, new AbortController().signal, () => {}, () => {})
        expect(tileCounts).toEqual([1])
        tileCounts = []
    })
    it('should reject promptly on abort and dispose everything', async () => {
        const ac = new AbortController()
        const dispose = vi.fn(), det = noBall()
        det.detect = () => new Promise(() => {}) // never answers
        const p = runBallCheck({ suggestions: [sug('a', 50)], marks: { team1: marks }, files, totalSec: 200 },
            { frames: fakeFrames([], dispose), detector: () => det }, ac.signal, () => {}, () => {})
        setTimeout(() => ac.abort(), 5)
        await expect(p).rejects.toThrow('Cancelled')
        await Promise.resolve()
        expect(det.dispose).toHaveBeenCalled()
        await new Promise((r) => setTimeout(r, 0))
        expect(dispose).toHaveBeenCalled()
    })
    it('should reject with a plain message when the detector cannot start', async () => {
        const det: BallDetectorLike = { ready: Promise.reject(new Error('model not found')), detect: async () => [], dispose: vi.fn() }
        await expect(runBallCheck({ suggestions: [sug('a', 50)], marks: { team1: marks }, files, totalSec: 200 },
            { frames: fakeFrames([]), detector: () => det }, new AbortController().signal, () => {}, () => {})).rejects.toThrow('model not found')
        expect(det.dispose).toHaveBeenCalled()
    })
    it('should skip suggestions that are already decided', async () => {
        const verdicts: string[] = []
        await runBallCheck({ suggestions: [{ ...sug('a', 50), status: 'kept' }], marks: { team1: marks }, files, totalSec: 200 },
            { frames: fakeFrames([]), detector: ballEverywhere }, new AbortController().signal, () => {}, (id) => verdicts.push(id))
        expect(verdicts).toEqual([])
    })
})
