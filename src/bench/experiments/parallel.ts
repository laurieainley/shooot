// Experiment 1: several units encoded at the same time (each with its own decoder and encoder), joined exactly as the journaled path joins them.
import { prepareSpec } from '../../graphics/prepare'
import { bitrateFor, excerptLen, journalAvailable, matchPlan, overlapOf, pair, run, verifyOutput, type ExpCtx } from '../expCommon'
import type { ExperimentRow } from '../results'

/** Seconds of output per unit in this experiment (so a 45 s excerpt has about six units to run side by side). */
const UNIT_SEC = 8

export async function parallelRows(ctx: ExpCtx): Promise<{ rows: ExperimentRow[]; notes: string[]; unsupported?: string }> {
    if (!(await journalAvailable())) return { rows: [], notes: [], unsupported: 'not supported here: parallel units are joined from OPFS saved-progress files and this browser has no OPFS writable files (renders stay in memory)' }
    const len = excerptLen(ctx)
    const plan = matchPlan(ctx, len, false)
    const graphics = await prepareSpec(plan.spec)
    const rows: ExperimentRow[] = []
    const notes = [`Units of ${UNIT_SEC} s of output, captions and score bug drawn; "overlap" = sum of unit wall times / elapsed time (1 = they ran one after another).`]
    const long = Math.max(ctx.probe.width, ctx.probe.height)
    const qualities: ('1080p' | '4k')[] = long >= 3824 ? ['1080p', '4k'] : ['1080p']
    if (qualities.length === 1) notes.push('4K skipped: the source is below 4K.')
    for (const quality of qualities) {
        const go = (n: number) => async () => {
            const r = await run(ctx, plan.cuts, { quality, bitrate: bitrateFor(quality), ...(graphics ? { graphics } : {}), extra: { experiments: { segmentSec: UNIT_SEC, parallelUnits: n } } })
            const spans = (r.rendering.stats?.unitSpans ?? []) as { startMs: number; endMs: number }[]
            const detail: Record<string, unknown> = { units: spans.length, ...overlapOf(spans), unitSpans: spans.map((s) => [Math.round(s.startMs), Math.round(s.endMs)]), pipeline: r.rendering.stats }
            if (n > 1) {
                const check = await verifyOutput(r.file, 'parallel.mp4', Array.from({ length: Math.floor(len / UNIT_SEC) }, (_, k) => (k + 1) * UNIT_SEC))
                detail.outputCheck = check
                return { wallMs: r.wallMs, bytes: r.bytes, detail, notes: check.ok ? [] : [`output check failed: ${check.problems.join('; ')}`] }
            }
            return { wallMs: r.wallMs, bytes: r.bytes, detail }
        }
        const counts = quality === '1080p' ? [2, 3] : [2]
        let firstBaseline: { ms: number; bytes?: number } | null = null
        for (const n of counts) {
            const baseline = firstBaseline
                ? async () => ({ wallMs: baseline0(firstBaseline!), ...(firstBaseline!.bytes !== undefined ? { bytes: firstBaseline!.bytes } : {}) })
                : async () => { const m = await go(1)(); firstBaseline = { ms: m.wallMs, ...(m.bytes !== undefined ? { bytes: m.bytes } : {}) }; return m }
            rows.push(await pair(`${quality}, ${n} units at once`, ['1 at a time', `${n} at once`], baseline, go(n)))
        }
    }
    return { rows, notes }
}

const baseline0 = (b: { ms: number }): number => b.ms
