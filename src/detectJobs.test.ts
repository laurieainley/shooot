import { describe, expect, it, vi } from 'vitest'
import { createDetectJobs } from './detectJobs'
import { BallDecodeError } from './detect/runBallCheck'
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
    it('should analyse kick off to final whistle, or the whole video when told to', async () => {
        const ev = (id: string, type: 'kick_off' | 'final_whistle', t: number) => ({ id, type, matchTimeSec: t, sourceFileIndex: 0 })
        useAppState.setState({ files: [file('A.MP4')] as never, cumulativeOffsets: [0], events: [ev('k', 'kick_off', 20), ev('w', 'final_whistle', 80)], suggestions: [], suggestionRun: null })
        const run = vi.fn(async () => ({ moments: [], scores: new Float32Array(1), analysedSec: 100 }))
        const jobs = createDetectJobs({ run: run as never, wakeLock: wl, now: () => 0 })
        await jobs.start()
        const rangeOf = (n: number): number[] => (run.mock.calls[n] as unknown as [unknown, number[]])[1]
        expect(rangeOf(0)).toEqual([20, 80])
        expect(useAppState.getState().suggestionRun?.bounded).toBe(true)
        await jobs.start({ wholeVideo: true })
        expect(rangeOf(1)[0]).toBe(0)
        expect(rangeOf(1)[1]).toBe(100)
        expect(useAppState.getState().suggestionRun?.bounded).toBe(false)
    })
})

describe('detection job phase 2 (ball check)', () => {
    const wake = () => ({ acquire: vi.fn(async () => {}), release: vi.fn(async () => {}), status: () => 'held' })
    const marks = { postL: { x: 0.4, y: 0.5 }, postR: { x: 0.6, y: 0.5 }, barL: { x: 0.4, y: 0.4 }, barR: { x: 0.6, y: 0.4 } }
    const audio = vi.fn(async () => ({ moments: [{ timeSec: 100, score: 3 }, { timeSec: 300, score: 2 }], scores: new Float32Array(3), analysedSec: 600 }))
    const setup = (labs: boolean, withMarks = true): void => {
        useAppState.setState({ files: [{ id: 'f', name: 'A', url: '', kind: 'full', durationSec: 600, file: new File([], 'A') }] as never, cumulativeOffsets: [0], events: [], suggestions: [], suggestionRun: null, labs, goalMarks: withMarks ? { team1: marks } : null })
    }
    const ballDeps = { frames: vi.fn(), detector: vi.fn() } as never

    it('should tag suggestions as verdicts arrive, holding one wake lock across both phases', async () => {
        setup(true)
        const w = wake()
        const ball = vi.fn(async (a: { suggestions: { id: string }[] }, _d, _s, onProgress: (f: number) => void, onVerdict: (id: string, b: { goal: 'team1'; frames: number } | null) => void) => {
            onVerdict(a.suggestions[0].id, { goal: 'team1', frames: 3 }); onProgress(0.5)
            onVerdict(a.suggestions[1].id, null); onProgress(1)
        })
        const jobs = createDetectJobs({ run: audio as never, wakeLock: () => w, now: (() => { let t = 0; return () => (t += 10) })(), ball: ball as never, ballDeps })
        await jobs.start()
        const s = useAppState.getState().suggestions
        expect(s[0].ball).toEqual({ goal: 'team1', frames: 3 })
        expect(s[1].ball).toBeUndefined()
        expect(jobs.store.getState()).toMatchObject({ phase: 'done', ballPhase: 'done', ballFraction: 1, ballError: null })
        expect(jobs.store.getState().ballMs).toBeGreaterThan(0)
        expect(w.acquire).toHaveBeenCalledTimes(1); expect(w.release).toHaveBeenCalledTimes(1)
    })
    it('should not run the ball check without Labs, without goal marks, or without suggestions', async () => {
        const ball = vi.fn()
        setup(false)
        await createDetectJobs({ run: audio as never, wakeLock: wake, now: () => 0, ball: ball as never, ballDeps }).start()
        setup(true, false)
        await createDetectJobs({ run: audio as never, wakeLock: wake, now: () => 0, ball: ball as never, ballDeps }).start()
        setup(true)
        await createDetectJobs({ run: vi.fn(async () => ({ moments: [], scores: new Float32Array(1), analysedSec: 600 })) as never, wakeLock: wake, now: () => 0, ball: ball as never, ballDeps }).start()
        expect(ball).not.toHaveBeenCalled()
    })
    it('should say the model is missing and keep the audio suggestions', async () => {
        setup(true)
        const jobs = createDetectJobs({ run: audio as never, wakeLock: wake, now: () => 0, ball: vi.fn(async () => { throw new Error('model not found') }) as never, ballDeps })
        await jobs.start()
        expect(jobs.store.getState()).toMatchObject({ phase: 'done', ballPhase: 'failed', ballError: 'Ball check unavailable: model not found.' })
        expect(useAppState.getState().suggestions).toHaveLength(2)
    })
    it('should report any other ball failure plainly', async () => {
        setup(true)
        const jobs = createDetectJobs({ run: audio as never, wakeLock: wake, now: () => 0, ball: vi.fn(async () => { throw new Error('no WebGPU') }) as never, ballDeps })
        await jobs.start()
        expect(jobs.store.getState().ballError).toBe('Ball check failed: no WebGPU')
        expect(jobs.store.getState().phase).toBe('done')
    })
    it('should stop on Cancel, keep tags already written and not show an error', async () => {
        setup(true)
        const ball = vi.fn((a: { suggestions: { id: string }[] }, _d, signal: AbortSignal, _p, onVerdict: (id: string, b: { goal: 'team1'; frames: number }) => void) => {
            onVerdict(a.suggestions[0].id, { goal: 'team1', frames: 2 })
            return new Promise<never>((_, rej) => signal.addEventListener('abort', () => rej(new Error('Cancelled'))))
        })
        const w = wake()
        const jobs = createDetectJobs({ run: audio as never, wakeLock: () => w, now: () => 0, ball: ball as never, ballDeps })
        const p = jobs.start()
        await vi.waitFor(() => expect(jobs.store.getState().ballPhase).toBe('running'))
        jobs.cancel(); await p
        expect(jobs.store.getState()).toMatchObject({ phase: 'done', ballPhase: 'idle', ballError: null })
        expect(useAppState.getState().suggestions[0].ball).toEqual({ goal: 'team1', frames: 2 })
        expect(useAppState.getState().suggestions).toHaveLength(2)
        expect(w.release).toHaveBeenCalled()
    })
    it('should skip a suggestion decided while the ball check runs', async () => {
        setup(true)
        const calls: number[][] = []
        const frames = async () => ({
            frameSize: { w: 1000, h: 1000 },
            async *tilesAt(times: number[]) {
                calls.push(times)
                if (calls.length > 99) yield { timeSec: 0, images: [] }
                if (calls.length === 1) useAppState.getState().decideSuggestion(useAppState.getState().suggestions[1].id, { kind: 'reject' })
            },
            dispose: () => {},
        })
        const detector = () => ({ ready: Promise.resolve({ ep: 'wasm' }), detect: async () => [], dispose: () => {} })
        const jobs = createDetectJobs({ run: audio as never, wakeLock: wake, now: () => 0, ballDeps: { frames, detector } as never })
        await jobs.start()
        expect(calls).toHaveLength(1)
        expect(Math.min(...calls[0])).toBeLessThan(110)
        expect(jobs.store.getState().ballPhase).toBe('done')
    })
    it('should read full-quality files for the ball check and the proxy for the audio pass', async () => {
        const proxy = new File([], 'GL010226.LRV'), full = new File([], 'GX010226.MP4')
        useAppState.setState({ files: [{ id: 'f', name: 'GX010226.MP4', url: '', kind: 'proxy', durationSec: 600, file: proxy, fullFile: full }] as never, cumulativeOffsets: [0], events: [], suggestions: [], suggestionRun: null, labs: true, goalMarks: { team1: marks } })
        const run = vi.fn(async () => ({ moments: [{ timeSec: 300, score: 2 }], scores: new Float32Array(3), analysedSec: 600 }))
        const opened: File[] = []
        const frames = async (f: File) => ({ frameSize: { w: 1000, h: 1000 }, async *tilesAt() { /* no frames */ }, dispose: () => {}, _f: opened.push(f) })
        const detector = () => ({ ready: Promise.resolve({ ep: 'wasm' }), detect: async () => [], dispose: () => {} })
        const jobs = createDetectJobs({ run: run as never, wakeLock: wake, now: () => 0, ballDeps: { frames, detector } as never })
        await jobs.start()
        expect((run.mock.calls[0] as unknown as [{ file: File }[]])[0].map((f) => f.file)).toEqual([proxy])
        expect(opened).toEqual([full])
    })
    it('should record the execution provider and a plain decode failure with the raw reason kept aside', async () => {
        setup(true)
        const ball = vi.fn(async (_a, _d, _s, _p, _v, onReady: (ep: string) => void) => { onReady('webgpu'); return { ep: 'webgpu' } })
        const jobs = createDetectJobs({ run: audio as never, wakeLock: wake, now: () => 0, ball: ball as never, ballDeps })
        await jobs.start()
        expect(jobs.store.getState()).toMatchObject({ ballPhase: 'done', ballEp: 'webgpu', ballDetail: null })
        const bad = vi.fn(async () => { throw new BallDecodeError('VideoDecoder: unsupported codec hvc1') })
        const jobs2 = createDetectJobs({ run: audio as never, wakeLock: wake, now: () => 0, ball: bad as never, ballDeps })
        await jobs2.start()
        expect(jobs2.store.getState()).toMatchObject({ ballPhase: 'failed', ballError: "Ball check failed: this browser can't decode the video.", ballDetail: 'VideoDecoder: unsupported codec hvc1' })
    })
    it('should stop phase 2 when Labs is switched off meanwhile, keeping the audio results', async () => {
        setup(true)
        const ball = vi.fn((_a, _d, signal: AbortSignal) => new Promise<never>((_, rej) => signal.addEventListener('abort', () => rej(new Error('Cancelled')))))
        const jobs = createDetectJobs({ run: audio as never, wakeLock: wake, now: () => 0, ball: ball as never, ballDeps })
        const p = jobs.start()
        await vi.waitFor(() => expect(jobs.store.getState().ballPhase).toBe('running'))
        useAppState.getState().setLabs(false)
        await p
        expect(jobs.store.getState()).toMatchObject({ phase: 'done', ballPhase: 'idle', ballError: null })
        expect(useAppState.getState().suggestions).toHaveLength(2)
    })
})
