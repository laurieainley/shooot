// The /bench "Experiments": candidate speed-ups measured as baseline/variant pairs on a short excerpt of one source file.
// Every experiment is OFF in the normal stages (the engine switches live in RenderOptions.experiments and default to off), each runs
// inside a wrapper that records failures with their stack, and one failing never stops the rest.
import { errorInfo } from '../render/diagnostics'
import { bitrateFor, cleanOutputs, clearKept, plainPlan, run, type ExpCtx } from './expCommon'
import { directSaveRows } from './experiments/directSave'
import { latencyRows, pipelineRows } from './experiments/encoder'
import { overlayCacheRows } from './experiments/overlayCache'
import { parallelRows } from './experiments/parallel'
import { playbackRows } from './experiments/playback'
import { segmentCacheRows } from './experiments/segmentCache'
import { tightSpansRows } from './experiments/tightSpans'
import { workerRows } from './experiments/worker'
import type { ExperimentId, ExperimentResult, ExperimentRow } from './results'
import { probeCodecSupport } from './stages'

type Outcome = { rows: ExperimentRow[]; notes?: string[]; detail?: Record<string, unknown>; unsupported?: string }

export type ExperimentDef = {
    id: ExperimentId
    /** The number in the brief. */
    number: number
    name: string
    hint: string
    /** Needs the browser to decode the source and encode H.264 (everything but the copy-only ones). */
    reencodes: boolean
    run: (ctx: ExpCtx) => Promise<Outcome>
}

export const EXPERIMENTS: ExperimentDef[] = [
    { id: 'parallel', number: 1, name: 'Parallel encodes', reencodes: true, hint: '1, 2 (and 3) units encoded at once, 1080p and 4K; checks the joined file.', run: parallelRows },
    { id: 'segmentCache', number: 2, name: 'Segment cache (estimate)', reencodes: true, hint: 'Highlights reel re-rendered after changing one caption, reusing unchanged units.', run: segmentCacheRows },
    { id: 'playback', number: 3, name: 'Render while playing (estimate)', reencodes: true, hint: 'A goal clip + replay rendered with and without the source playing; dropped frames and jitter.', run: playbackRows },
    { id: 'directSave', number: 4, name: 'Direct save + save-step cost', reencodes: false, hint: 'Stream into a chosen file (desktop Chrome) vs OPFS + delivery; elsewhere only the delivery cost.', run: directSaveRows },
    { id: 'overlayCache', number: 5, name: 'Cached overlays', reencodes: true, hint: 'Caption, score bug and replay tag drawn from cached bitmaps; ms per frame, renders, pixel diff.', run: overlayCacheRows },
    { id: 'tightSpans', number: 6, name: 'Tighter graphics sections (Original highlights)', reencodes: false, hint: 'Re-encode only the visible part of each overlay window.', run: tightSpansRows },
    { id: 'latency', number: 7, name: 'Encoder latencyMode realtime', reencodes: true, hint: '10 s at 1080p and 4K; outputs offered for download.', run: latencyRows },
    { id: 'pipeline', number: 9, name: 'Pipeline depth + time breakdown', reencodes: true, hint: 'Encoder queue length and decoded pictures read ahead.', run: pipelineRows },
    { id: 'worker', number: 10, name: 'Render in a Web Worker', reencodes: true, hint: '1080p on the main thread vs in a dedicated worker, with and without graphics.', run: workerRows },
]

export const EXPERIMENT_MINUTES = 22

/** A short throwaway render before the first experiment: codec start-up and the first read of the file would otherwise land on the first baseline. */
export async function warmUp(ctx: ExpCtx): Promise<void> {
    try {
        const len = Math.min(4, Math.floor(ctx.probe.durationSec))
        await run(ctx, plainPlan(len).cuts, { quality: '1080p', bitrate: bitrateFor('1080p') })
    } catch { /* the experiments report their own failures */ } finally { await cleanOutputs() }
}

/** Runs one experiment; never throws. */
export async function runExperiment(def: ExperimentDef, ctx: ExpCtx): Promise<ExperimentResult> {
    const base = { id: def.id, number: def.number, name: def.name, source: ctx.source.name, excerptSec: ctx.excerptSec }
    try {
        if (def.reencodes) {
            const support = await probeCodecSupport(ctx.probe)
            if (support.decode === false) return { ...base, status: 'skipped', reason: `this browser cannot decode ${ctx.probe.codec}`, rows: [] }
        }
        const out = await def.run(ctx)
        const failed = out.rows.length > 0 && out.rows.every((r) => r.error)
        const res: ExperimentResult = {
            ...base, status: out.unsupported ? 'skipped' : failed ? 'failed' : 'ok', rows: out.rows,
            ...(out.unsupported ? { reason: out.unsupported } : {}), ...(out.notes?.length ? { notes: out.notes } : {}), ...(out.detail ? { detail: out.detail } : {}),
            ...(failed && out.rows[0].error ? { error: out.rows[0].error } : {}),
        }
        return res
    } catch (e) {
        return { ...base, status: 'failed', rows: [], error: errorInfo(e) }
    } finally {
        await cleanOutputs()
        if (def.id !== 'latency') await clearKept()
    }
}
