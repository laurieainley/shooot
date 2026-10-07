import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRenderJobs, type RenderJobDeps } from './renderJobs'
import type { RenderRequest } from './renderJobs'

const req = (name = 'highlights.mp4'): RenderRequest => ({ cuts: [{ sourceIndex: 0, startSec: 0, endSec: 1 }], sources: [], outputName: name })

function setup(render: RenderJobDeps['render']) {
    const deps: RenderJobDeps = {
        render, download: vi.fn(() => true), notify: vi.fn(), now: vi.fn(() => 0),
        createUrl: vi.fn(() => 'blob:x'), revokeUrl: vi.fn(),
    }
    return { store: createRenderJobs(deps), deps }
}
const deferred = <T,>() => {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
    return { promise, resolve, reject }
}

describe('render job wake lock', () => {
    const lockFor = () => ({ acquire: vi.fn(async () => {}), release: vi.fn(async () => {}), status: vi.fn(() => 'held') })
    const withLock = (render: RenderJobDeps['render']) => {
        const lock = lockFor()
        const deps: RenderJobDeps = { render, download: vi.fn(() => true), notify: vi.fn(), now: vi.fn(() => 0), createUrl: vi.fn(() => 'blob:x'), revokeUrl: vi.fn(), wakeLock: () => lock }
        return { store: createRenderJobs(deps), lock }
    }
    it('should hold the lock while rendering and release it when done', async () => {
        const gate = deferred<Blob>()
        const { store, lock } = withLock(async () => gate.promise)
        const p = store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
        await vi.waitFor(() => expect(lock.acquire).toHaveBeenCalled())
        expect(lock.release).not.toHaveBeenCalled()
        gate.resolve(new Blob(['x']))
        await p
        expect(lock.release).toHaveBeenCalledTimes(1)
    })
    it('should release the lock when the render fails', async () => {
        const { store, lock } = withLock(async () => { throw new Error('boom') })
        await store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
        expect(lock.release).toHaveBeenCalledTimes(1)
    })
    it('should release the lock when cancelled', async () => {
        const { store, lock } = withLock((_c, _s, o) => new Promise((_r, rej) => o.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))))
        const p = store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
        await vi.waitFor(() => expect(lock.acquire).toHaveBeenCalled())
        store.getState().cancel()
        await p
        expect(lock.release).toHaveBeenCalledTimes(1)
    })
    it('should hand the lock status to the engine', async () => {
        let status: string | undefined
        const { store } = withLock(async (_c, _s, o) => { status = o.wakeLockStatus?.(); return new Blob(['x']) })
        await store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
        expect(status).toBe('held')
    })
    it('should render when the lock cannot be taken', async () => {
        const { store, lock } = withLock(async () => new Blob(['x']))
        lock.acquire.mockRejectedValue(new Error('no'))
        await store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
        expect(store.getState().job?.phase).toBe('done')
    })
})

describe('render job manager', () => {
    let gate: ReturnType<typeof deferred<Blob>>
    beforeEach(() => { gate = deferred<Blob>() })

    it('should run a job, report progress, then auto-download its file once', async () => {
        const { store, deps } = setup(async (_c, _s, o) => { o.onProgress({ cutIndex: 0, cutCount: 2, fraction: 0.42 }); return gate.promise })
        const done = store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
        await vi.waitFor(() => expect(store.getState().job?.fraction).toBe(0.42))
        expect(store.getState().job?.phase).toBe('running')
        gate.resolve(new Blob(['x']))
        await done
        const job = store.getState().job!
        expect(job.phase).toBe('done')
        expect(job.result?.file.name).toBe('highlights.mp4')
        expect(deps.download).toHaveBeenCalledTimes(1)
        expect(job.result?.downloaded).toBe(true)
    })

    it('should keep the report of a render without graphics (replay crops that could not be made)', async () => {
        const skipped = [{ label: 'Replay zoom: Goal 0:00:20', reason: 'this browser cannot encode video' }]
        const { store } = setup(async (_c, _s, o) => { o.onGraphics?.({ applied: [], skipped }); return new Blob(['x']) })
        await store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
        expect(store.getState().job?.report?.skipped).toEqual(skipped)
    })

    it('should allow only one render at a time', async () => {
        const { store } = setup(async () => gate.promise)
        void store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
        await vi.waitFor(() => expect(store.getState().job?.phase).toBe('running'))
        const second = await store.getState().start({ kind: 'fullMatch', quality: 'full' }, async () => req('full-match.mp4'))
        expect(second).toBe('busy')
        expect(store.getState().job?.kind).toBe('highlights')
        expect(store.getState().conflict).toBe(true)
    })

    it('should cancel through the abort signal and go back to idle without output', async () => {
        const { store, deps } = setup((_c, _s, o) => new Promise((_, reject) => {
            o.signal!.addEventListener('abort', () => reject(new DOMException('Render cancelled', 'AbortError')))
        }))
        const done = store.getState().start({ kind: 'fullMatch', quality: 'full' }, async () => req('full-match.mp4'))
        await vi.waitFor(() => expect(store.getState().job?.phase).toBe('running'))
        store.getState().cancel()
        await done
        expect(store.getState().job).toBeNull()
        expect(deps.download).not.toHaveBeenCalled()
    })

    it('should keep a failure with its message', async () => {
        const { store } = setup(async () => { throw new Error('disk full') })
        await store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
        expect(store.getState().job).toMatchObject({ phase: 'failed', error: 'disk full' })
        expect(store.getState().running()).toBe(false)
    })

    it('should start the next render after the last one finished, dropping the old result', async () => {
        const { store, deps } = setup(async () => new Blob(['x']))
        await store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
        await store.getState().start({ kind: 'fullMatch', quality: 'full' }, async () => req('full-match.mp4'))
        expect(store.getState().job?.result?.file.name).toBe('full-match.mp4')
        expect(deps.revokeUrl).toHaveBeenCalled()
    })

    describe('mixed frame sizes notice', () => {
        it('should hold the render on the notice until it is confirmed', async () => {
            let answer: boolean | null = null
            const { store } = setup(async (_c, _s, o) => { answer = await o.confirmMixedSizes!('B.MP4 is 3840×2160'); return gate.promise })
            const done = store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
            await vi.waitFor(() => expect(store.getState().job?.notice).toBe('B.MP4 is 3840×2160'))
            expect(answer).toBeNull()
            store.getState().answerNotice(true)
            await vi.waitFor(() => expect(answer).toBe(true))
            expect(store.getState().job?.notice).toBeNull()
            gate.resolve(new Blob(['x']))
            await done
            expect(store.getState().job?.phase).toBe('done')
        })

        it('should cancel the render when the notice is declined', async () => {
            const { store } = setup(async (_c, _s, o) => {
                if (!(await o.confirmMixedSizes!('notice'))) throw new DOMException('Render cancelled', 'AbortError')
                return gate.promise
            })
            const done = store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
            await vi.waitFor(() => expect(store.getState().job?.notice).toBe('notice'))
            store.getState().answerNotice(false)
            await done
            expect(store.getState().job).toBeNull()
        })

        it('should decline a pending notice when the render is cancelled', async () => {
            let answer: boolean | null = null
            const { store } = setup(async (_c, _s, o) => { answer = await o.confirmMixedSizes!('notice'); throw new DOMException('Render cancelled', 'AbortError') })
            const done = store.getState().start({ kind: 'highlights', quality: 'full' }, async () => req())
            await vi.waitFor(() => expect(store.getState().job?.notice).toBe('notice'))
            store.getState().cancel()
            await done
            expect(answer).toBe(false)
        })
    })
})
