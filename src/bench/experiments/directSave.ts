// Experiment 4: stream the finished MP4 straight into a file the user picked (showSaveFilePicker), against writing it to
// browser storage (OPFS) and then delivering it. Only where the browser has the save picker (desktop Chrome / Edge).
import { measureDeliver } from '../deliver'
import { excerptLen, pair, plainPlan, run, type ExpCtx } from '../expCommon'
import type { ExperimentRow } from '../results'

export const hasSavePicker = (): boolean => typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'

/** Streams a finished output to a file handle, like the browser's download does. Returns ms. */
async function deliverToHandle(file: Blob, handle: FileSystemFileHandle): Promise<number> {
    const t0 = performance.now()
    const w = await handle.createWritable()
    await file.stream().pipeTo(w)
    return performance.now() - t0
}

export async function directSaveRows(ctx: ExpCtx): Promise<{ rows: ExperimentRow[]; notes: string[]; unsupported?: string }> {
    const len = excerptLen(ctx)
    const plan = plainPlan(len)
    const handle = ctx.saveHandle
    if (!hasSavePicker() || !handle) {
        // Not supported (or no file chosen): still report what the delivery step costs after a normal copy render.
        const why = !hasSavePicker() ? 'not supported: this browser has no showSaveFilePicker' : 'no output file was chosen'
        const r = await run(ctx, plan.cuts)
        let note = why
        const row: ExperimentRow = { label: 'stream copy, OPFS then deliver', baselineName: 'render + deliver', variantName: 'direct save', baselineMs: r.wallMs, baselineBytes: r.bytes }
        try {
            const d = await measureDeliver(r.file, 'bench-directsave.mp4', ctx.realDownload)
            row.baselineMs = r.wallMs + d.readMs + d.prepareMs
            row.detail = { renderMs: Math.round(r.wallMs), deliver: d }
            note += `. Deliver cost: ${(d.readMs / 1000).toFixed(1)} s to read ${(d.bytes / 1048576).toFixed(0)} MB (${d.readMBps.toFixed(0)} MB/s)`
        } finally { void 0 }
        row.note = note
        return { rows: [row], notes: [note], unsupported: why }
    }
    const row = await pair('stream copy of the excerpt', ['OPFS + deliver', 'direct to file'], async () => {
        const r = await run(ctx, plan.cuts)
        const deliverMs = await deliverToHandle(r.file, handle)
        return { wallMs: r.wallMs + deliverMs, bytes: r.bytes, detail: { renderMs: Math.round(r.wallMs), deliverMs: Math.round(deliverMs) } }
    }, async () => {
        const r = await run(ctx, plan.cuts, { extra: { experiments: { targetFile: handle } } })
        const size = (await handle.getFile()).size
        return { wallMs: r.wallMs, bytes: size, detail: { renderMs: Math.round(r.wallMs), fileBytes: size } }
    })
    return { rows: [row], notes: ['Baseline = render to OPFS, then stream that file into the chosen file. Variant = the MP4 is written into the chosen file as it is finished.'] }
}
