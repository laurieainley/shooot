// Experiment 2: re-render a short highlights reel after changing one caption. The unit cache is a production feature now
// (render/unitCache.ts, used by the editor's Highlights and Full match re-encodes); here it is switched on for a render with the
// same reuse keys the editor builds, so the bench measures what a user gets: a full render that saves its units, then the
// edited reel with the units the change did not touch reused.
import { prepareSpec } from '../../graphics/prepare'
import { buildReuseKeys } from '../../render/unitCache'
import type { Cut } from '../../render/types'
import type { GraphicsSpec } from '../../graphics/types'
import { highlightsExport, planOutput } from '../../utils/exportPlans'
import { bitrateFor, cleanOutputs, journalAvailable, excerptLen, excerptState, pair, run, verifyOutput, type ExpCtx } from '../expCommon'
import type { ExperimentRow } from '../results'

const UNIT_SEC = 10

export async function segmentCacheRows(ctx: ExpCtx): Promise<{ rows: ExperimentRow[]; notes: string[]; detail: Record<string, unknown>; unsupported?: string }> {
    if (!(await journalAvailable())) return { rows: [], notes: [], detail: {}, unsupported: 'not supported here: the unit cache needs OPFS writable files (this browser renders in memory)' }
    const len = excerptLen(ctx)
    const quality = '1080p'
    const out = planOutput(quality)!
    const s1 = excerptState(ctx, len, { replays: true, goals: 2 })
    const plan1 = highlightsExport({ ...s1, graphics: { ...s1.graphics, cards: true } }, 'full', out)
    // Change ONE caption: the scorer of goal 2.
    const s2 = { ...s1, events: s1.events.map((e) => (e.id === 'g2' ? { ...e, scorer: 'D. Different' } : e)) }
    const plan2 = highlightsExport({ ...s2, graphics: { ...s2.graphics, cards: true } }, 'full', out)
    const g1 = await prepareSpec(plan1.spec)
    const g2 = await prepareSpec(plan2.spec)
    const keysOf = (cuts: Cut[], spec: GraphicsSpec | undefined) => buildReuseKeys({ which: 'fullMatch', cuts, sources: [ctx.source], spec, quality, videoBitrate: bitrateFor(quality), logo: 'default' })
    const detail: Record<string, unknown> = { reelSeconds: plan1.seconds, cuts: plan1.cuts.length }
    const row = await pair('1080p highlights reel, one caption changed', ['full render', 'incremental'], async () => {
        // Full render (empty cache), saving every unit: the cost of saving is included.
        await cleanOutputs()
        const r = await run(ctx, plan1.cuts, { quality, ...(g1 ? { graphics: g1 } : {}), extra: { reuse: keysOf(plan1.cuts, plan1.spec), experiments: { segmentSec: UNIT_SEC } } })
        const st = r.rendering.stats as { reused?: { units: number; of: number } } | undefined
        return { wallMs: r.wallMs, bytes: r.bytes, detail: { unitsReused: st?.reused?.units ?? 0, unitsCacheable: st?.reused?.of ?? 0 } }
    }, async () => {
        // The second plan: units the change did not touch come from the first render.
        const r = await run(ctx, plan2.cuts, { quality, ...(g2 ? { graphics: g2 } : {}), extra: { reuse: keysOf(plan2.cuts, plan2.spec), experiments: { segmentSec: UNIT_SEC } } })
        const check = await verifyOutput(r.file, 'incremental.mp4', [])
        const st = r.rendering.stats as { reused?: { units: number; of: number } } | undefined
        const reused = st?.reused?.units ?? 0
        const of = st?.reused?.of ?? 0
        return { wallMs: r.wallMs, bytes: r.bytes, detail: { unitsReused: reused, unitsRendered: of - reused, outputCheck: check }, notes: check.ok ? [`${reused} of ${of} units reused`] : [`output check failed: ${check.problems.join('; ')}`] }
    }, { keepCacheAfterBaseline: true })
    return { rows: [row], notes: [`${UNIT_SEC} s units. The full-time card lists scorers, so changing the goal 2 scorer also redraws that card. The same cache the editor uses.`], detail }
}
