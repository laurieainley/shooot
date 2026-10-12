// Experiment 7 (VideoEncoder latencyMode realtime vs quality) and experiment 9 (pipeline depth + where the time goes).
import { prepareSpec } from '../../graphics/prepare'
import type { RenderExperiments } from '../../render/experiments'
import { bitrateFor, excerptLen, keepCopy, matchPlan, pair, plainPlan, run, type ExpCtx } from '../expCommon'
import type { ExperimentRow } from '../results'

/** Experiment 7. Short (10 s) excerpts so the outputs can be brought back for a quality check (SSIM against the source). */
export async function latencyRows(ctx: ExpCtx): Promise<{ rows: ExperimentRow[]; notes: string[] }> {
    const len = excerptLen(ctx, 10)
    const plan = plainPlan(len)
    const rows: ExperimentRow[] = []
    const long = Math.max(ctx.probe.width, ctx.probe.height)
    const qualities: ('1080p' | '4k')[] = long >= 3824 ? ['1080p', '4k'] : ['1080p']
    for (const quality of qualities) {
        const go = (mode: 'quality' | 'realtime') => async () => {
            const r = await run(ctx, plan.cuts, { quality, bitrate: bitrateFor(quality), extra: { experiments: { latencyMode: mode } } })
            const kept = await keepCopy(r.file, `latency-${quality}-${mode}.mp4`)
            ctx.addArtifact(`latency-${quality}-${mode}.mp4`, kept)
            const mbps = (r.bytes ?? 0) * 8 / len / 1e6
            return { wallMs: r.wallMs, bytes: r.bytes, detail: { actualMbps: +mbps.toFixed(2), requestedMbps: bitrateFor(quality) / 1e6, excerptSec: len, pipeline: r.rendering.stats }, notes: [`${mbps.toFixed(1)} Mbps actual`] }
        }
        rows.push(await pair(`${quality}, ${len} s`, ['quality', 'realtime'], go('quality'), go('realtime')))
    }
    return { rows, notes: [`Outputs are offered for download (latency-*.mp4): compare their picture quality with the source on a computer (SSIM).`] }
}

type Setting = { name: string; exp: RenderExperiments }

const SETTINGS: Setting[] = [
    { name: 'queue 1', exp: { encodeQueue: 1 } },
    { name: 'queue 8', exp: { encodeQueue: 8 } },
    { name: 'read ahead 4', exp: { decodeAhead: 4 } },
]

/** Experiment 9: encoder queue length and decoded pictures read ahead, against the defaults (queue 3, no extra read-ahead). */
export async function pipelineRows(ctx: ExpCtx): Promise<{ rows: ExperimentRow[]; notes: string[]; detail: Record<string, unknown> }> {
    const len = excerptLen(ctx)
    const plan = matchPlan(ctx, len, false)
    const graphics = await prepareSpec(plan.spec)
    const rows: ExperimentRow[] = []
    const detail: Record<string, unknown> = {}
    let baselineMs: number | null = null
    let baselineBytes: number | undefined
    const go = (exp: RenderExperiments | null) => async () => {
        const r = await run(ctx, plan.cuts, { quality: '1080p', bitrate: bitrateFor('1080p'), ...(graphics ? { graphics } : {}), ...(exp ? { extra: { experiments: exp } } : {}) })
        const s = r.rendering.stats as { decodeWaitMs?: number; paintMs?: number; encodeCallMs?: number; backpressureMs?: number; drainMs?: number } | null
        const sec = (v?: number): number => +(((v ?? 0) / 1000)).toFixed(1)
        return { wallMs: r.wallMs, bytes: r.bytes, detail: { breakdownSec: { decodeWait: sec(s?.decodeWaitMs), paintAndScale: sec(s?.paintMs), encodeCall: sec(s?.encodeCallMs), backpressure: sec(s?.backpressureMs), packetWrites: sec(s?.drainMs) } } }
    }
    for (const [i, st] of SETTINGS.entries()) {
        const row = await pair(`1080p with graphics, ${st.name}`, ['queue 3, no read-ahead', st.name],
            i === 0 ? async () => { const m = await go(null)(); baselineMs = m.wallMs; baselineBytes = m.bytes; return m } : async () => ({ wallMs: baselineMs ?? 0, ...(baselineBytes !== undefined ? { bytes: baselineBytes } : {}) }),
            go(st.exp))
        rows.push(row)
    }
    detail.settings = SETTINGS.map((s) => ({ name: s.name, ...s.exp }))
    return { rows, notes: ['Each row carries a time breakdown in its detail (decode wait / paint and scale / encode call / encoder back-pressure / packet writes), also on every normal re-encode stage.'], detail }
}
