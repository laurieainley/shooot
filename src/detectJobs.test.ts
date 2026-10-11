import { describe, expect, it, vi } from 'vitest'
import { createDetectJobs } from './detectJobs'
import { useAppState } from './state'

describe('detection job', () => {
    it('should run, write suggestions, hold and release the wake lock', async () => {
        const wake = { acquire: vi.fn(async () => {}), release: vi.fn(async () => {}), status: () => 'held' }
        const run = vi.fn(async () => ({ moments: [{ timeSec: 100, score: 3 }], scores: new Float32Array(3), analysedSec: 600 }))
        useAppState.setState({ files: [{ id: 'f', name: 'A', url: '', kind: 'full', durationSec: 600, file: new File([], 'A') }] as never, cumulativeOffsets: [0], events: [], suggestions: [] })
        const jobs = createDetectJobs({ run, wakeLock: () => wake, now: (() => { let t = 2; return () => (t += 1) })() })
        await jobs.start()
        expect(jobs.store.getState().phase).toBe('done')
        expect(useAppState.getState().suggestions.map((s) => s.globalTimeSec)).toEqual([100])
        expect(useAppState.getState().suggestionRun).toMatchObject({ analysedSec: 600, total: 1, configVersion: 2, durationMs: 1, fileKeys: ['A'] })
        expect(wake.acquire).toHaveBeenCalled(); expect(wake.release).toHaveBeenCalled()
    })
    it('should analyse the playback file (the proxy when one is paired), not the full-quality file', async () => {
        const proxy = new File([], 'GL010226.LRV'), full = new File([], 'GX010226.MP4')
        useAppState.setState({ files: [{ id: 'f', name: 'GX010226.MP4', url: '', kind: 'proxy', durationSec: 600, file: proxy, fullFile: full }] as never, cumulativeOffsets: [0], events: [], suggestions: [] })
        const run = vi.fn(async () => ({ moments: [], scores: new Float32Array(3), analysedSec: 600 }))
        const jobs = createDetectJobs({ run, wakeLock: () => ({ acquire: async () => {}, release: async () => {}, status: () => '' }), now: () => 0 })
        await jobs.start()
        const files = (run.mock.calls[0] as unknown as [{ file: File }[]])[0]
        expect(files.map((f) => f.file)).toEqual([proxy])
    })
    it('should keep previous suggestions when cancelled', async () => {
        useAppState.setState({ suggestions: [{ id: 'old', globalTimeSec: 50, score: 1, source: 'audio', status: 'pending' }] })
        const run = vi.fn((_f, _r, _d, signal: AbortSignal) => new Promise<never>((_, rej) => signal.addEventListener('abort', () => rej(new Error('cancelled')))))
        const jobs = createDetectJobs({ run: run as never, wakeLock: () => ({ acquire: async () => {}, release: async () => {}, status: () => '' }), now: () => 0 })
        const p = jobs.start(); jobs.cancel(); await p
        expect(jobs.store.getState().phase).toBe('cancelled')
        expect(useAppState.getState().suggestions.map((s) => s.id)).toEqual(['old'])
    })
    it('should report a failure in plain words', async () => {
        const jobs = createDetectJobs({ run: vi.fn(async () => { throw new Error('no decoder for this audio') }), wakeLock: () => ({ acquire: async () => {}, release: async () => {}, status: () => '' }), now: () => 0 })
        await jobs.start()
        expect(jobs.store.getState()).toMatchObject({ phase: 'failed', error: 'no decoder for this audio' })
    })
    it('should fail plainly when there is nothing to analyse', async () => {
        useAppState.setState({ files: [{ id: 'f', name: 'A', url: '', kind: 'full', durationSec: 0 }] as never, cumulativeOffsets: [0], events: [] })
        const run = vi.fn()
        const jobs = createDetectJobs({ run: run as never, wakeLock: () => ({ acquire: async () => {}, release: async () => {}, status: () => '' }), now: () => 0 })
        await jobs.start()
        expect(jobs.store.getState()).toMatchObject({ phase: 'failed', error: 'Load the match videos first.' })
        expect(run).not.toHaveBeenCalled()
    })
    it('should keep a later file on the timeline when a file in the middle cannot be analysed', async () => {
        const f = (n: string, d?: number) => ({ id: n, name: n, url: '', kind: 'full', durationSec: d, file: new File([], n) })
        useAppState.setState({ files: [f('A', 100), f('B'), f('C', 100)] as never, cumulativeOffsets: [0, 100, 300], events: [], suggestions: [] })
        const run = vi.fn(async () => ({ moments: [], scores: new Float32Array(1), analysedSec: 200 }))
        const jobs = createDetectJobs({ run: run as never, wakeLock: () => ({ acquire: async () => {}, release: async () => {}, status: () => '' }), now: () => 0 })
        await jobs.start()
        const [files, range] = run.mock.calls[0] as unknown as [{ offsetSec: number }[], [number, number]]
        expect(files.map((x) => x.offsetSec)).toEqual([0, 300])
        expect(range[1]).toBeGreaterThanOrEqual(400)
    })
})

describe('detection job and changing files', () => {
    const wl = () => ({ acquire: async () => {}, release: async () => {}, status: () => '' })
    const file = (n: string) => ({ id: n, name: n, url: '', kind: 'full', durationSec: 100, file: new File([], n) })
    it('should drop the result when the files were replaced during the run', async () => {
        useAppState.setState({ files: [file('A')] as never, cumulativeOffsets: [0], events: [], suggestions: [], suggestionRun: null })
        let release: () => void = () => {}
        const run = vi.fn(() => new Promise((resolve) => { release = () => resolve({ moments: [{ timeSec: 10, score: 2 }], scores: new Float32Array(1), analysedSec: 100 }) }))
        const jobs = createDetectJobs({ run: run as never, wakeLock: wl, now: () => 0 })
        const p = jobs.start()
        await Promise.resolve(); await Promise.resolve()
        useAppState.setState({ files: [file('B')] as never })
        release(); await p
        expect(jobs.store.getState().phase).toBe('cancelled')
        expect(useAppState.getState().suggestions).toEqual([])
    })
    it('should be cancelled by a new match', async () => {
        useAppState.setState({ files: [file('A')] as never, cumulativeOffsets: [0], events: [], suggestions: [], suggestionRun: null })
        let signal: AbortSignal | undefined
        const run = vi.fn((_f, _r, _d, s: AbortSignal) => { signal = s; return new Promise<never>(() => {}) })
        const jobs = createDetectJobs({ run: run as never, wakeLock: wl, now: () => 0 })
        void jobs.start()
        await Promise.resolve(); await Promise.resolve()
        useAppState.getState().newMatch()
        expect(signal?.aborted).toBe(true)
    })
    it('should record the file keys on the run', async () => {
        useAppState.setState({ files: [file('A.MP4')] as never, cumulativeOffsets: [0], events: [], suggestions: [], suggestionRun: null })
        const jobs = createDetectJobs({ run: vi.fn(async () => ({ moments: [], scores: new Float32Array(1), analysedSec: 100 })) as never, wakeLock: wl, now: () => 0 })
        await jobs.start()
        expect(useAppState.getState().suggestionRun?.fileKeys).toHaveLength(1)
    })
})
