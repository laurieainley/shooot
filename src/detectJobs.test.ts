import { describe, expect, it, vi } from 'vitest'
import { createDetectJobs } from './detectJobs'
import { useAppState } from './state'

describe('detection job', () => {
    it('should run, write suggestions, hold and release the wake lock', async () => {
        const wake = { acquire: vi.fn(async () => {}), release: vi.fn(async () => {}), status: () => 'held' }
        const run = vi.fn(async () => ({ moments: [{ timeSec: 100, score: 3 }], scores: new Float32Array(3), analysedSec: 600 }))
        useAppState.setState({ files: [{ id: 'f', name: 'A', url: '', kind: 'full', durationSec: 600, file: new File([], 'A') }] as never, cumulativeOffsets: [0], events: [], suggestions: [] })
        const jobs = createDetectJobs({ run, wakeLock: () => wake, now: () => 5 })
        await jobs.start()
        expect(jobs.store.getState().phase).toBe('done')
        expect(useAppState.getState().suggestions.map((s) => s.globalTimeSec)).toEqual([100])
        expect(useAppState.getState().suggestionRun).toMatchObject({ analysedSec: 600, total: 1, configVersion: 1 })
        expect(wake.acquire).toHaveBeenCalled(); expect(wake.release).toHaveBeenCalled()
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
})
