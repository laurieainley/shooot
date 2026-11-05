import { useEffect, useState } from 'react'
import { reusableParts, type CacheKind, type ReusableParts } from '../render/unitCache'
import { planOutput, type ExportPlan } from '../utils/exportPlans'
import type { OutputQuality } from '../utils/outputQuality'
import { reuseKeysFor } from './renderRequest'
import { usePrepare } from '../prepare/wire'

/**
 * What the cache holds for each re-encode quality (none while unknown): for the quality the background preparer works on, how much of each part is
 * prepared right now; for the others, what the last export left. Re-read when the plan changes or a render ends.
 */
export function useReusableParts(kind: CacheKind, plan: ExportPlan, busy: boolean): (q: OutputQuality) => ReusableParts | null {
    const prepared = usePrepare((s) => s.shares[kind])
    const [parts, setParts] = useState<Partial<Record<OutputQuality, ReusableParts>>>({})
    useEffect(() => {
        if (busy) return
        let live = true
        void (async () => {
            const next: Partial<Record<OutputQuality, ReusableParts>> = {}
            for (const q of ['4k', '1080p'] as const) {
                const keys = await reuseKeysFor({ ...plan, output: planOutput(q) })
                if (keys) next[q] = await reusableParts(kind, keys, plan.cuts.length)
            }
            if (live) setParts(next)
        })().catch(() => undefined)
        return () => { live = false }
    }, [kind, plan, busy])
    return (q) => {
        const p = prepared?.quality === q && prepared.state.cuts.length === plan.cuts.length ? prepared.state : null
        if (p) return { intro: p.intro, outro: p.outro, cuts: p.cuts }
        return parts[q] ?? null
    }
}
