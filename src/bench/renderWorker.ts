// A dedicated worker that runs the real render engine (experiment 10). Mediabunny, WebCodecs, OPFS and OffscreenCanvas all exist
// in workers; the graphics are built here from the plain spec (fonts come from the worker's own FontFaceSet).
import { renderReel } from '../render/mediabunnyEngine'
import { errorInfo } from '../render/diagnostics'
import { discardJob } from '../render/renderJob'
import { prepareSpec } from '../graphics/prepare'
import type { GraphicsSpec } from '../graphics/types'
import type { Cut } from '../render/types'
import type { ReencodeQuality } from '../render/transcodePlan'

export type WorkerRequest = { cuts: Cut[]; file: File; quality: ReencodeQuality; bitrate: number; spec?: GraphicsSpec }
export type WorkerMessage =
    | { type: 'progress'; fraction: number }
    | { type: 'done'; size: number; stats: Record<string, unknown> | null; notes: string[]; graphicsApplied: string[]; graphicsSkipped: string[] }
    | { type: 'error'; message: string; name?: string; stack?: string }

const post = (m: WorkerMessage): void => (self as unknown as { postMessage: (m: WorkerMessage) => void }).postMessage(m)

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
    const { cuts, file, quality, bitrate, spec } = ev.data
    try {
        await discardJob()
        let stats: Record<string, unknown> | null = null
        let report: { notes: string[]; applied: string[]; skipped: string[] } = { notes: [], applied: [], skipped: [] }
        const graphics = spec ? await prepareSpec(spec) : undefined
        const out = await renderReel(cuts, [{ name: file.name, file }], {
            kind: 'fullMatch', outputName: 'bench-output.mp4', resumable: { signature: `bench-worker-${Date.now()}`, kind: 'fullMatch' },
            output: { quality, videoBitrate: bitrate },
            onProgress: (p) => post({ type: 'progress', fraction: p.fraction }),
            onStats: (s) => { stats = { ...s } },
            onDiagnostics: (d) => { report = { notes: d.notes, applied: d.graphics.applied, skipped: d.graphics.skipped.map((g) => `${g.label}: ${g.reason}`) } },
            ...(graphics ? { graphics } : {}),
        })
        await discardJob()
        post({ type: 'done', size: out.size, stats, notes: report.notes, graphicsApplied: report.applied, graphicsSkipped: report.skipped })
    } catch (e) {
        const i = errorInfo(e)
        post({ type: 'error', message: i.message, ...(i.name ? { name: i.name } : {}), ...(i.stack ? { stack: i.stack } : {}) })
    }
}
