import { describe, expect, it } from 'vitest'
import { runPool } from './unitPool'

const abort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 1))

/** A fake unit runner: tracks concurrency and which units finished; `fail(job, concurrent)` decides who throws. */
function harness(fail: (job: number, concurrent: number, attempt: number) => unknown | null = () => null) {
    let live = 0
    let peak = 0
    const peakAfter: number[] = []
    const attempts = new Map<number, number>()
    const finished: number[] = []
    let fellBackAt = -1
    const run = async (job: number): Promise<void> => {
        live++
        peak = Math.max(peak, live)
        if (fellBackAt >= 0) peakAfter.push(live)
        const attempt = (attempts.get(job) ?? 0) + 1
        attempts.set(job, attempt)
        try {
            await tick()
            const e = fail(job, live, attempt)
            if (e) throw e
            await tick()
            finished.push(job)
        } finally { live-- }
    }
    return { run, finished, attempts, get peak() { return peak }, peakAfter, markFallback: () => { fellBackAt = finished.length } }
}

describe('runPool', () => {
    it('should run two units at once and finish every unit', async () => {
        const h = harness()
        const r = await runPool({ jobs: [0, 1, 2, 3, 4], width: 2, run: h.run, isAbort: abort, onFallback: () => undefined })
        expect(h.peak).toBe(2)
        expect(h.finished.sort()).toEqual([0, 1, 2, 3, 4])
        expect(r).toEqual({ width: 2, fellBack: false })
    })
    it('should run one at a time when asked for one', async () => {
        const h = harness()
        await runPool({ jobs: [0, 1, 2], width: 1, run: h.run, isAbort: abort, onFallback: () => undefined })
        expect(h.peak).toBe(1)
    })
    it('should drop to one at a time and retry the unit when a unit fails while another runs', async () => {
        // Unit 1 cannot get a second encoder: it fails whenever something else is running.
        const h = harness((job, live) => (job === 1 && live > 1 ? new Error('encoder limit') : null))
        const notes: string[] = []
        const r = await runPool({ jobs: [0, 1, 2, 3, 4, 5], width: 2, run: h.run, isAbort: abort, onFallback: (j, e) => { h.markFallback(); notes.push(`${j}:${(e as Error).message}`) } })
        expect(r).toEqual({ width: 1, fellBack: true })
        expect(notes).toEqual(['1:encoder limit'])
        expect(h.finished.sort()).toEqual([0, 1, 2, 3, 4, 5])
        expect(h.attempts.get(1)).toBe(2)
        // Nothing overlapped after the fallback.
        expect(Math.max(...h.peakAfter)).toBe(1)
    })
    it('should fall back once even when both running units fail', async () => {
        const h = harness((_job, live, attempt) => (live > 1 && attempt === 1 ? new Error('limit') : null))
        let falls = 0
        const r = await runPool({ jobs: [0, 1, 2], width: 2, run: h.run, isAbort: abort, onFallback: () => { falls++ } })
        expect(falls).toBe(1)
        expect(r.fellBack).toBe(true)
        expect(h.finished.sort()).toEqual([0, 1, 2])
    })
    it('should retry a unit that fails on its own once via retrySerial, then give up', async () => {
        const h = harness((job) => (job === 0 ? new Error('boom') : null))
        let asked = 0
        await expect(runPool({ jobs: [0], width: 2, run: h.run, isAbort: abort, onFallback: () => undefined, retrySerial: async () => asked++ === 0 })).rejects.toThrow('boom')
        expect(asked).toBe(2)
        expect(h.attempts.get(0)).toBe(2)
    })
    it('should not treat a cancel as parallelism trouble', async () => {
        const h = harness((job) => (job === 1 ? new DOMException('Render cancelled', 'AbortError') : null))
        let fell = false
        await expect(runPool({ jobs: [0, 1, 2, 3], width: 2, run: h.run, isAbort: abort, onFallback: () => { fell = true } })).rejects.toThrow('Render cancelled')
        expect(fell).toBe(false)
    })
    it('should tell running units to stop when it gives up', async () => {
        let fatal = 0
        const h = harness((job) => (job === 0 ? new DOMException('x', 'AbortError') : null))
        await expect(runPool({ jobs: [0, 1], width: 2, run: h.run, isAbort: abort, onFallback: () => undefined, onFatal: () => { fatal++ } })).rejects.toBeDefined()
        expect(fatal).toBe(1)
    })
})
