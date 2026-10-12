// Experiment 10: the same 1080p re-encode inside a dedicated Web Worker, against the main thread. Also records how long the page
// itself was blocked (the point of a worker: the screen stays responsive while exporting).
import { prepareSpec } from '../../graphics/prepare'
import { bitrateFor, excerptLen, matchPlan, pair, plainPlan, run, type ExpCtx } from '../expCommon'
import type { WorkerMessage, WorkerRequest } from '../renderWorker'
import type { ExperimentRow } from '../results'
import { cleanOutputs } from '../expCommon'

/** Records how late a 10 ms timer fires on the page while `during` runs (the page's own responsiveness). */
async function withLag<T>(during: () => Promise<T>): Promise<{ value: T; lag: { maxMs: number; p95Ms: number; ticks: number } }> {
    const lags: number[] = []
    let last = performance.now()
    const timer = setInterval(() => { const now = performance.now(); lags.push(Math.max(0, now - last - 10)); last = now }, 10)
    try {
        const value = await during()
        const sorted = [...lags].sort((a, b) => a - b)
        return { value, lag: { maxMs: Math.round(sorted[sorted.length - 1] ?? 0), p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0), ticks: lags.length } }
    } finally { clearInterval(timer) }
}

function inWorker(ctx: ExpCtx, req: Omit<WorkerRequest, 'file'>): Promise<Extract<WorkerMessage, { type: 'done' }>> {
    return new Promise((resolve, reject) => {
        const w = new Worker(new URL('../renderWorker.ts', import.meta.url), { type: 'module' })
        const finish = (fn: () => void): void => { ctx.signal.removeEventListener('abort', onAbort); w.terminate(); fn() }
        const onAbort = (): void => finish(() => reject(new DOMException('Render cancelled', 'AbortError')))
        ctx.signal.addEventListener('abort', onAbort)
        w.onmessage = (ev: MessageEvent<WorkerMessage>) => {
            const m = ev.data
            if (m.type === 'progress') ctx.onProgress(m.fraction, 'worker')
            else if (m.type === 'done') finish(() => resolve(m))
            else finish(() => { const e = new Error(m.message); if (m.stack) e.stack = m.stack; if (m.name) e.name = m.name; reject(e) })
        }
        w.onerror = (ev) => finish(() => reject(new Error(`worker failed to run: ${ev.message || 'unknown error (the worker script could not start)'}`)))
        w.postMessage({ ...req, file: ctx.source.file } satisfies WorkerRequest)
    })
}

export async function workerRows(ctx: ExpCtx): Promise<{ rows: ExperimentRow[]; notes: string[] }> {
    if (typeof Worker === 'undefined') throw new Error('this browser has no Web Workers')
    const len = excerptLen(ctx)
    const rows: ExperimentRow[] = []
    const notes: string[] = []
    const quality = '1080p'
    // 1. No graphics: certain to work in a worker.
    const plain = plainPlan(len)
    rows.push(await pair('1080p, no graphics', ['main thread', 'worker'], async () => {
        const { value, lag } = await withLag(() => run(ctx, plain.cuts, { quality, bitrate: bitrateFor(quality) }))
        return { wallMs: value.wallMs, bytes: value.bytes, detail: { pageTimerLag: lag, pipeline: value.rendering.stats } }
    }, async () => {
        const t0 = performance.now()
        const { value, lag } = await withLag(() => inWorker(ctx, { cuts: plain.cuts, quality, bitrate: bitrateFor(quality) }))
        return { wallMs: performance.now() - t0, bytes: value.size, detail: { pageTimerLag: lag, pipeline: value.stats } }
    }))
    // 2. With graphics: needs fonts, painters and the logo to work in the worker. Reported honestly either way.
    const plan = matchPlan(ctx, len, false)
    const graphics = await prepareSpec(plan.spec)
    if (plan.spec && graphics) {
        const row = await pair('1080p, with captions and score bug', ['main thread', 'worker'], async () => {
            const { value, lag } = await withLag(() => run(ctx, plan.cuts, { quality, bitrate: bitrateFor(quality), graphics }))
            return { wallMs: value.wallMs, bytes: value.bytes, detail: { pageTimerLag: lag, graphicsApplied: value.rendering.diagnostics?.graphics.applied } }
        }, async () => {
            const t0 = performance.now()
            const { value, lag } = await withLag(() => inWorker(ctx, { cuts: plan.cuts, quality, bitrate: bitrateFor(quality), spec: plan.spec! }))
            const wallMs = performance.now() - t0
            const note = value.graphicsSkipped.length ? `graphics left out in the worker: ${value.graphicsSkipped.join('; ')}` : `graphics drawn in the worker: ${value.graphicsApplied.join(', ')}`
            return { wallMs, bytes: value.size, detail: { pageTimerLag: lag, graphicsApplied: value.graphicsApplied, graphicsSkipped: value.graphicsSkipped }, notes: [note] }
        })
        rows.push(row)
    } else notes.push('The plan has no graphics, so only the no-graphics comparison ran.')
    await cleanOutputs()
    notes.push('The worker figure includes starting the worker and loading the engine; "pageTimerLag" is how late a 10 ms timer on the page fired while rendering.')
    return { rows, notes }
}
